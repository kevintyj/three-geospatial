// cSpell:words varint busway guideway

import Point from '@mapbox/point-geometry'
import { VectorTile } from '@mapbox/vector-tile'
import type Pbf from 'pbf'
import Protobuf from 'pbf'
import {
  LineSymbolizer,
  paint,
  PolygonSymbolizer,
  TileCache as TileCacheBase,
  toIndex,
  View,
  type Feature,
  type PaintRule,
  type PreparedTile,
  type Zxy
} from 'protomaps-leaflet'

import { Transfer, type TransferResult } from '../transfer'

const url = 'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt'
const maxDataLevel = 14
const tileDimension = 128 // We don't need much resolution.
const dataDimension = 256

const canvas = new OffscreenCanvas(tileDimension, tileDimension)
const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D

// Flip Y here, as we use transferToImageBitmap().
const scale = tileDimension / dataDimension
context.translate(0, tileDimension)
context.scale(scale, -scale)

const streetLineWidthAtLevel14: Record<string, number | undefined> = {
  motorway: 3,
  trunk: 2.5,
  primary: 2,
  secondary: 1.5,
  tertiary: 1,
  unclassified: 1,
  residential: 1,
  busway: 1,
  bus_guideway: 1,
  pedestrian: 0.5,
  rail: 0.5,
  living_street: 0.5
}

const filterWaterPolygons = (feature: Pick<Feature, 'props'>): boolean => {
  return feature.props.kind !== 'glacier'
}

const filterBridge = (feature: Pick<Feature, 'props'>): boolean => {
  return feature.props.bridge === true
}

const paintRules: PaintRule[] = [
  {
    dataLayer: 'ocean',
    symbolizer: new PolygonSymbolizer({ fill: '#fff' })
  },
  {
    dataLayer: 'water_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#fff' }),
    filter: (zoom, feature) => filterWaterPolygons(feature)
  },
  {
    dataLayer: 'bridges',
    symbolizer: new PolygonSymbolizer({ fill: '#000' })
  },
  {
    dataLayer: 'pier_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#000' })
  },
  {
    dataLayer: 'dam_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#000' })
  },
  {
    dataLayer: 'street_polygons',
    symbolizer: new PolygonSymbolizer({ fill: '#000' }),
    filter: (zoom, feature) => filterBridge(feature)
  },
  {
    dataLayer: 'streets',
    symbolizer: new LineSymbolizer({
      color: '#000',
      width: (z, f) => {
        if (f == null) {
          return 0
        }
        const width = streetLineWidthAtLevel14[f.props.kind as string] ?? 0.3
        return width * 2 ** (z - 14)
      }
    }),
    filter: (zoom, feature) => filterBridge(feature)
  }
]

const layerKeys = paintRules.map(({ dataLayer }) => dataLayer)

// Pbf.readSVarint uses "num % 2 === 1 ? (num + 1) / -2 : num / 2", which is
// an order of magnitude slower than bit operation.
function readSVarint(pbf: Pbf): number {
  const num = pbf.readVarint()
  return (num >>> 1) ^ -(num & 1) // zigzag encoding
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function loadGeomAndBbox(pbf: Protobuf, geometry: number, scale: number) {
  pbf.pos = geometry
  const end = pbf.readVarint() + pbf.pos
  let cmd = 1
  let length = 0
  let x = 0
  let y = 0
  let x1 = Infinity
  let x2 = -Infinity
  let y1 = Infinity
  let y2 = -Infinity

  const lines: Point[][] = []
  let line: Point[] = []
  while (pbf.pos < end) {
    if (length <= 0) {
      const cmdLen = pbf.readVarint()
      cmd = cmdLen & 0x7
      length = cmdLen >> 3
    }
    length--
    if (cmd === 1 || cmd === 2) {
      x += readSVarint(pbf) * scale
      y += readSVarint(pbf) * scale
      if (x < x1) x1 = x
      if (x > x2) x2 = x
      if (y < y1) y1 = y
      if (y > y2) y2 = y
      if (cmd === 1) {
        if (line.length > 0) lines.push(line)
        line = []
      }
      line.push(new Point(x, y))
    } else if (cmd === 7) {
      if (line != null) line.push(line[0].clone())
    } else throw new Error(`unknown command ${cmd}`)
  }
  if (line != null) lines.push(line)
  return { geom: lines, bbox: { minX: x1, minY: y1, maxX: x2, maxY: y2 } }
}

// See: https://github.com/protomaps/protomaps-leaflet/blob/main/src/tilecache.ts
// I had to copy-paste them because they are not exported.
function parseTile(
  buffer: ArrayBuffer,
  tileSize: number,
  layerKeys?: string[],
  filters?: Record<
    string,
    (feature: Pick<Feature, 'props'>) => boolean | undefined
  >
): Map<string, Feature[]> {
  const v = new VectorTile(new Protobuf(buffer))
  const result = new Map<string, Feature[]>()
  for (const [key, value] of Object.entries(v.layers)) {
    if (layerKeys?.includes(key) === false) {
      continue // This greatly speeds things up.
    }

    const filter = filters?.[key]
    const features = []
    const layer = value as any
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      if (filter?.({ props: feature.properties }) === false) {
        continue
      }

      const loaded = loadGeomAndBbox(
        feature._pbf,
        feature._geometry,
        tileSize / layer.extent
      )
      let numVertices = 0
      for (const part of loaded.geom) numVertices += part.length
      features.push({
        id: feature.id,
        geomType: feature.type,
        geom: loaded.geom,
        numVertices,
        bbox: loaded.bbox,
        props: feature.properties
      })
    }
    result.set(key, features)
  }
  return result
}

class TileSource {
  url: string

  constructor(url: string) {
    this.url = url
  }

  public async get(
    { x, y, z }: Zxy,
    tileSize: number
  ): Promise<Map<string, Feature[]>> {
    const url = this.url
      .replace('{z}', `${z}`)
      .replace('{x}', `${x}`)
      .replace('{y}', `${y}`)
    return await fetch(url)
      .then(async response => await response.arrayBuffer())
      .then(buffer =>
        parseTile(buffer, tileSize, layerKeys, {
          street_polygons: filterBridge,
          streets: filterBridge
        })
      )
  }
}

// See: https://github.com/protomaps/protomaps-leaflet/blob/main/src/tilecache.ts
// Just to specify the threshold for the maximum number of caches.
class TileCache extends TileCacheBase {
  maxCacheCount: number

  constructor(source: TileSource, tileSize: number, maxCacheCount = 64) {
    super(source, tileSize)
    this.maxCacheCount = maxCacheCount
  }

  override async get(c: Zxy): Promise<Map<string, Feature[]>> {
    const idx = toIndex(c)
    return await new Promise((resolve, reject) => {
      const entry = this.cache.get(idx)
      if (entry != null) {
        entry.used = performance.now()
        resolve(entry.data)
      } else {
        const ifEntry = this.inflight.get(idx)
        if (ifEntry != null) {
          ifEntry.push({ resolve, reject })
        } else {
          this.inflight.set(idx, [])
          this.source
            .get(c, this.tileSize)
            .then(tile => {
              this.cache.set(idx, { used: performance.now(), data: tile })

              const ifEntry2 = this.inflight.get(idx)
              if (ifEntry2 != null) {
                for (const f of ifEntry2) {
                  f.resolve(tile)
                }
              }
              this.inflight.delete(idx)
              resolve(tile)

              if (this.cache.size >= this.maxCacheCount) {
                let minUsed = Infinity
                let minKey = undefined
                this.cache.forEach((value, key) => {
                  if (value.used < minUsed) {
                    minUsed = value.used
                    minKey = key
                  }
                })
                if (minKey != null) this.cache.delete(minKey)
              }
            })
            .catch((error: unknown) => {
              const ifEntry2 = this.inflight.get(idx)
              if (ifEntry2 != null) {
                for (const f of ifEntry2) {
                  f.reject(error instanceof Error ? error : new Error())
                }
              }
              this.inflight.delete(idx)
              reject(error instanceof Error ? error : new Error())
            })
        }
      }
    })
  }
}

function isLandOnly({ data }: PreparedTile): boolean {
  // If there are no water features, it's definitely land-only.
  const ocean = data.get('ocean')
  const waterPolygons = data.get('water_polygons')?.filter(filterWaterPolygons)
  return (ocean?.length ?? 0) === 0 && (waterPolygons?.length ?? 0) === 0
}

function isWaterOnly({ data }: PreparedTile): boolean {
  for (const key of layerKeys) {
    if (key !== 'ocean' && (data.get(key)?.length ?? 0) > 0) {
      return false // Has an occlusion
    }
  }
  const ocean = data.get('ocean')
  return ocean?.[0]?.numVertices === 5 // Expected to be a rectangle
}

const levelDiff = 2
const source = new TileSource(url)
const cache = new TileCache(source, dataDimension * levelDiff ** 2, 4)
const view = new View(cache, maxDataLevel, levelDiff)

export interface WaterAreaTileImageResult {
  image?: ImageBitmap
  solid?: 'land' | 'water'
}

export async function computeWaterAreaTileImage(
  coordinate: Zxy
): Promise<TransferResult<WaterAreaTileImageResult>> {
  try {
    context.fillStyle = '#000'
    context.fillRect(0, 0, dataDimension, dataDimension)

    const { x, y, z } = coordinate

    const bbox = {
      minX: dataDimension * x,
      minY: dataDimension * y,
      maxX: dataDimension * (x + 1),
      maxY: dataDimension * (y + 1)
    }
    const origin = new Point(dataDimension * x, dataDimension * y)

    const preparedTile = await view.getDisplayTile(coordinate)
    if (isLandOnly(preparedTile)) {
      return { solid: 'land' }
    }
    if (isWaterOnly(preparedTile)) {
      return { solid: 'water' }
    }

    const preparedTileMap = new Map([['', [preparedTile]]])
    paint(context, z, preparedTileMap, null, paintRules, bbox, origin, false)

    const image = canvas.transferToImageBitmap()

    return Transfer({ image }, [image])
  } catch (error) {
    console.error(error)
    return {}
  }
}
