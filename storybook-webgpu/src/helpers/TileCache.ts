import {
  TileCache as TileCacheBase,
  toIndex,
  type Feature,
  type TileSource,
  type Zxy
} from 'protomaps-leaflet'

// See: https://github.com/protomaps/protomaps-leaflet/blob/5a153e7d5f49ec903e60eba9700a8ededd5a750e/src/tilecache.ts
// Just to specify the threshold for the maximum number of caches.
export class TileCache extends TileCacheBase {
  maxCacheCount: number

  constructor(source: TileSource, tileSize: number, maxCacheCount = 4) {
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
