import {
  XYZImageSource,
  type XYZImageSourceOptions
} from '3d-tiles-renderer/src/three/plugins/images/sources/XYZImageSource.js'
import { RedFormat, SRGBColorSpace, Texture } from 'three'

import { queueTask } from '../../worker/pool'

export interface WaterAreaImageSourceOptions extends Omit<
  XYZImageSourceOptions,
  'url' | 'tileDimensions'
> {}

export class WaterAreaImageSource extends XYZImageSource {
  private landTexture?: Texture
  private waterTexture?: Texture

  constructor({ levels = 20, ...options }: WaterAreaImageSourceOptions = {}) {
    super({
      ...options,
      levels,
      tileDimension: 128 // Tile size is fixed to 128px
    })
  }

  private async createColorTexture(color: string): Promise<Texture> {
    const { tileDimension } = this
    const canvas = document.createElement('canvas')
    canvas.width = tileDimension
    canvas.height = tileDimension
    const context = canvas.getContext('2d')!
    context.fillStyle = color
    context.fillRect(0, 0, tileDimension, tileDimension)

    const image = await createImageBitmap(canvas, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
      imageOrientation: 'flipY'
    })

    const texture = new Texture(image)
    texture.format = RedFormat
    texture.generateMipmaps = false
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }

  private async getLandTexture(): Promise<Texture> {
    return (this.landTexture ??= await this.createColorTexture('#000'))
  }

  private async getWaterTexture(): Promise<Texture> {
    return (this.waterTexture ??= await this.createColorTexture('#fff'))
  }

  override async fetchItem(
    tokens: [number, number, number],
    signal: AbortSignal
  ): Promise<Texture> {
    const [x, y, z] = tokens

    if (signal.aborted) {
      return await this.getLandTexture()
    }

    const taskPromise = queueTask('computeWaterAreaTileImage', [{ x, y, z }])

    const onAbort = (): void => {
      taskPromise.cancel()
    }
    signal.addEventListener('abort', onAbort)

    let result
    try {
      result = await taskPromise
    } catch (error) {
      console.error(error)
      return await this.getLandTexture()
    }

    signal.removeEventListener('abort', onAbort)

    if (result.image == null) {
      if (result.solid === 'water') {
        return await this.getWaterTexture()
      } else {
        return await this.getLandTexture()
      }
    }

    const texture = new Texture(result.image)
    texture.format = RedFormat
    texture.generateMipmaps = false
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }

  override disposeItem(texture: Texture): void {
    if (texture === this.landTexture || texture === this.waterTexture) {
      return // We reuse these textures
    }
    super.disposeItem(texture)
  }
}
