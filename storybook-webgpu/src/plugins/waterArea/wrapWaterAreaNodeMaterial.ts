import { Texture } from 'three'
import { attribute, Fn, texture, uniform } from 'three/tsl'
import type { NodeMaterial } from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'

import type { OverlayParams } from './WaterAreaOverlayPlugin'

const OVERLAY_PARAMS = Symbol('OVERLAY_PARAMS')

interface OverlayNodeMaterial extends NodeMaterial {
  [OVERLAY_PARAMS]?: OverlayParams
  defines: Record<string, unknown>
}

const emptyTexture = /*#__PURE__*/ new Texture()

const layerMap = texture().onObjectUpdate(({ material }, self) => {
  const { [OVERLAY_PARAMS]: params } = material as OverlayNodeMaterial
  self.value = params?.layerMaps.value[0] ?? emptyTexture
})

// WORKAROUND: ImageBitmap with imageOrientation='flipY' flips the UV in WebGPU
// renderer.
const layerMapFlipY = uniform('bool').onObjectUpdate(({ material }, self) => {
  const { [OVERLAY_PARAMS]: params } = material as OverlayNodeMaterial
  self.value = params?.layerMaps.value[0]?.image instanceof ImageBitmap
})

const layerUV = attribute('layer_uv_0', 'vec3').toVarying(`layerUV`)

export const layerColor = Fn(() => {
  const uv = layerMapFlipY.select(layerUV.xy.flipY(), layerUV.xy)
  return layerMap.sample(uv).toConst()
})()

export function wrapWaterAreaNodeMaterial(
  material: NodeMaterial
): OverlayParams {
  reinterpretType<OverlayNodeMaterial>(material)

  if (material[OVERLAY_PARAMS] != null) {
    return material[OVERLAY_PARAMS]
  }

  const params: OverlayParams = {
    layerMaps: { value: [] },
    layerInfo: { value: [] }
  }
  material[OVERLAY_PARAMS] = params

  let layerCount = 0

  // Use the same interface used for non-node materials:
  material.defines = {
    ...material.defines,

    get LAYER_COUNT() {
      return layerCount
    },

    set LAYER_COUNT(value: number) {
      if (value !== layerCount) {
        layerCount = value
      }
    }
  }

  return params
}
