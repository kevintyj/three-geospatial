import { ImageOverlayPlugin as ImageOverlayPluginBase } from '3d-tiles-renderer/three/plugins'
import { Mesh, type Color, type Object3D, type Texture } from 'three'

import { wrapOverlaysNodeMaterial } from './wrapOverlaysNodeMaterial'

declare module '3d-tiles-renderer/three/plugins' {
  interface ImageOverlayPlugin {
    meshParams: Map<Object3D, {}>
    _wrapMaterials(scene: Object3D): void
  }
}

interface LayerInfo {
  color: Color
  opacity: number
  alphaMask: boolean
  alphaInvert: boolean
}

export interface OverlayParams {
  layerMaps: { value: Array<Texture | null> }
  layerInfo: { value: LayerInfo[] }
}

export class ImageOverlayPlugin extends ImageOverlayPluginBase {
  override _wrapMaterials(scene: Object3D): void {
    scene.traverse(object => {
      if (object instanceof Mesh) {
        const params = wrapOverlaysNodeMaterial(object.material)
        this.meshParams.set(object, params)
      }
    })
  }
}
