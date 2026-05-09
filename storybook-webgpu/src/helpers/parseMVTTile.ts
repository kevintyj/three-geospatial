// See: https://github.com/protomaps/protomaps-leaflet/blob/main/src/tilecache.ts
// I had to copy-paste them because they are not exported.

import Point from '@mapbox/point-geometry'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import type { Feature } from 'protomaps-leaflet'

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
      x += pbf.readSVarint() * scale
      y += pbf.readSVarint() * scale
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

export function parseMVTTile(
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
