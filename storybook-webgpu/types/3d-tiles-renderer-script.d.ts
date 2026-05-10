declare module '3d-tiles-renderer/src/three/plugins/fade/wrapFadeMaterial.js' {
  import type { Material } from 'three'

  export function wrapFadeMaterial(
    material: Material,
    previousOnBeforeCompile: unknown
  ): FadeParams
}

declare module '3d-tiles-renderer/src/three/plugins/fade/FadeMaterialManager.js' {
  import type { Material } from 'three'

  export class FadeMaterialManager {
    protected prepareMaterial(material: Material): void
  }
}

declare module '3d-tiles-renderer/src/three/plugins/images/sources/TiledImageSource.js' {
  import type { Texture } from 'three'

  export interface TiledImageSourceOptions {
    fetchOptions?: RequestInit
  }

  export class TiledImageSource {
    fetchOptions: RequestInit
    fetchData: (
      input: string | URL | Request,
      init?: RequestInit
    ) => Promise<Response>

    constructor(options?: TiledImageSourceOptions)
    init(): Promise<void>
    processBufferToTexture(buffer: ArrayBuffer): Promise<Texture>
    fetchItem(
      tokens: [number, number, number],
      signal: AbortSignal
    ): Promise<Texture>
    disposeItem(texture: Texture): void
    getUrl(x: number, y: number, level: number): string
  }
}

declare module '3d-tiles-renderer/src/three/plugins/images/sources/XYZImageSource.js' {
  import type {
    TiledImageSource,
    TiledImageSourceOptions
  } from '3d-tiles-renderer/src/three/plugins/images/sources/TiledImageSource.js'

  export interface XYZImageSourceOptions extends TiledImageSourceOptions {
    levels?: number
    tileDimension?: number
    projection?: string
    url?: string | null
  }

  export class XYZImageSource extends TiledImageSource {
    levels: number
    tileDimension: number
    projection: string
    url: string | null

    constructor(options?: XYZImageSourceOptions)
  }
}
