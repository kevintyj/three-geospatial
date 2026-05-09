// cSpell:words zoomaborts busway guideway

import Point from '@mapbox/point-geometry'
import {
  LineSymbolizer,
  paint,
  PolygonSymbolizer,
  View,
  type Feature,
  type PaintRule,
  type PreparedTile,
  type Zxy
} from 'protomaps-leaflet'

import { parseMVTTile } from '../../helpers/parseMVTTile'
import { TileCache } from '../../helpers/TileCache'
import { Transfer, type TransferResult } from '../transfer'

const url = 'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt'
const maxDataLevel = 14
const tileDimension = 128 // We don't need much resolution.
const dataDimension = 256

const canvas = new OffscreenCanvas(tileDimension, tileDimension)
const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
const scale = tileDimension / dataDimension
context.scale(scale, scale)

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
        parseMVTTile(buffer, tileSize, layerKeys, {
          street_polygons: filterBridge,
          streets: filterBridge
        })
      )
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
const cache = new TileCache(source, dataDimension * levelDiff ** 2)
const view = new View(cache, maxDataLevel, levelDiff)

export interface MVTWaterAreaTileImage {
  image?: ImageBitmap
  static?: 'land' | 'water'
}

export async function computeMVTWaterAreaTileImage(
  coordinate: Zxy
): Promise<TransferResult<MVTWaterAreaTileImage>> {
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
      return { static: 'land' }
    }
    if (isWaterOnly(preparedTile)) {
      return { static: 'land' }
    }

    const preparedTileMap = new Map([['', [preparedTile]]])
    paint(context, z, preparedTileMap, null, paintRules, bbox, origin, false)

    const image = await createImageBitmap(canvas, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
      imageOrientation: 'flipY'
    })

    return Transfer({ image }, [image])
  } catch (error) {
    console.error(error)
    return {}
  }
}
