// Ported to TSL from: https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/v0.4.24/src/three/plugins/images/overlays/wrapOverlaysMaterial.js

import { Color, Texture } from 'three'
import {
  attribute,
  Fn,
  fwidth,
  If,
  materialColor,
  materialOpacity,
  smoothstep,
  texture,
  uniform,
  vec4
} from 'three/tsl'
import type { Node, NodeMaterial } from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'

import type { OverlayParams } from './ImageOverlayPlugin'

const OVERLAY_PARAMS = Symbol('OVERLAY_PARAMS')

interface OverlayNodeMaterial extends NodeMaterial {
  [OVERLAY_PARAMS]?: OverlayParams
  defines: Record<string, unknown>
}

const emptyTexture = /*#__PURE__*/ new Texture()
const emptyColor = /*#__PURE__*/ new Color()

const MAX_LAYER_COUNT = 10

const layerMap = Array.from({ length: MAX_LAYER_COUNT }, (_, index) =>
  texture().onObjectUpdate(({ material }, self) => {
    const { [OVERLAY_PARAMS]: params } = material as OverlayNodeMaterial
    self.value = params!.layerMaps.value[index] ?? emptyTexture
  })
)

const layerColor = Array.from({ length: MAX_LAYER_COUNT }, (_, index) =>
  uniform('color').onObjectUpdate(({ material }, { value }) => {
    const { [OVERLAY_PARAMS]: params } = material as OverlayNodeMaterial
    value.copy(params!.layerInfo.value[index]?.color ?? emptyColor)
  })
)

const layerOpacity = Array.from({ length: MAX_LAYER_COUNT }, (_, index) =>
  uniform('float').onObjectUpdate(({ material }, self) => {
    const { [OVERLAY_PARAMS]: params } = material as OverlayNodeMaterial
    self.value = params!.layerInfo.value[index]?.opacity ?? 0
  })
)

const layerAlphaMask = Array.from({ length: MAX_LAYER_COUNT }, (_, index) =>
  uniform('bool').onObjectUpdate(({ material }, self) => {
    const { [OVERLAY_PARAMS]: params } = material as OverlayNodeMaterial
    self.value = params!.layerInfo.value[index]?.alphaMask ?? false
  })
)

const layerAlphaInvert = Array.from({ length: MAX_LAYER_COUNT }, (_, index) =>
  uniform('bool').onObjectUpdate(({ material }, self) => {
    const { [OVERLAY_PARAMS]: params } = material as OverlayNodeMaterial
    self.value = params!.layerInfo.value[index]?.alphaInvert ?? false
  })
)

const layerUV = Array.from({ length: MAX_LAYER_COUNT }, (_, index) =>
  attribute(`layer_uv_${index}`, 'vec3').toVarying()
)

const overlayNodeCache = new Map<number, Node>()

function getOverlayNode(layerCount: number): Node {
  if (overlayNodeCache.has(layerCount)) {
    return overlayNodeCache.get(layerCount)!
  }

  const overlayNode = Fn(() => {
    const result = vec4(materialColor, materialOpacity).toVar()

    for (let i = 0; i < layerCount; ++i) {
      const tint = layerMap[i].sample(layerUV[i].xy).toVar()

      // Discard texture outside 0, 1 on w - offset the stepped value by an
      // epsilon to avoid cases where wDelta is near 0 (eg a flat surface) at
      // the w boundary, resulting in artifacts on some hardware.
      const wDelta = fwidth(layerUV[i].z).max(1e-7).toConst()
      const wOpacity = smoothstep(wDelta.negate(), 0, layerUV[i].z)
        .mul(smoothstep(wDelta.add(1), 1, layerUV[i].z))
        .toConst()

      // Apply tint color and opacity
      tint.rgb.mulAssign(layerColor[i])
      tint.mulAssign(layerOpacity[i].mul(wOpacity))

      // Invert the alpha
      If(layerAlphaInvert[i], () => {
        tint.a.assign(tint.a.oneMinus())
      })

      // Apply the alpha across all existing layers if alpha mask is true
      If(layerAlphaMask[i], () => {
        result.a.mulAssign(tint.a)
      }).Else(() => {
        tint.rgb.mulAssign(tint.a)
        result.assign(tint.add(result.mul(tint.a.oneMinus())))
      })
    }
    return result
  })()

  overlayNodeCache.set(layerCount, overlayNode)
  return overlayNode
}

export function wrapOverlaysNodeMaterial(
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

  let LAYER_COUNT = 0

  // Use the same interface used for non-node materials:
  material.defines = {
    ...material.defines,

    get LAYER_COUNT() {
      return LAYER_COUNT
    },

    set LAYER_COUNT(value: number) {
      if (value !== LAYER_COUNT) {
        LAYER_COUNT = value
        const overlayNode = getOverlayNode(value)
        material.colorNode = overlayNode.xyz
        material.opacityNode = overlayNode.w
      }
    }
  }

  return params
}
