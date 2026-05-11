import { ImageOverlayPlugin } from '3d-tiles-renderer/three/plugins'
import { Mesh, type Color, type Object3D, type Texture } from 'three'

import { wrapWaterAreaNodeMaterial } from './wrapWaterAreaNodeMaterial'

interface ImageOverlay {
  color: Color
  opacity: number
  alphaMask: boolean
  alphaInvert: boolean
}

export interface OverlayParams {
  layerMaps: { value: Array<Texture | null> }
  layerInfo: { value: ImageOverlay[] }
}

export class WaterAreaOverlayPlugin extends ImageOverlayPlugin {
  constructor(options: ConstructorParameters<typeof ImageOverlayPlugin>[0]) {
    super({
      ...options,
      resolution: 128 // Tile size is fixed to 128px
    })
  }

  override _wrapMaterials(scene: Object3D): void {
    scene.traverse(object => {
      if (object instanceof Mesh) {
        const params = wrapWaterAreaNodeMaterial(object.material)
        this.meshParams.set(object, params)
      }
    })
  }
}
