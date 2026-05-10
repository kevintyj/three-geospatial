import {
  cameraPosition,
  color,
  Fn,
  materialColor,
  mix,
  normalView,
  positionView,
  vec3,
  vec4
} from 'three/tsl'
import { MeshPhysicalNodeMaterial, type Node } from 'three/webgpu'

import { getAtmosphereContext } from '@takram/three-atmosphere/webgpu'
import { rayEllipsoidIntersection } from '@takram/three-geospatial/webgpu'

import { layerColor } from './wrapWaterAreaNodeMaterial'

export const positionECEF = Fn(builder => {
  const { matrixViewToECEF } = getAtmosphereContext(builder)
  return matrixViewToECEF.mul(vec4(positionView, 1)).xyz
})()

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ellipsoidPositionECEF = Fn(builder => {
  const { ellipsoid } = getAtmosphereContext(builder)
  const intersection = rayEllipsoidIntersection(
    cameraPosition,
    rayDirectionECEF,
    vec3(ellipsoid.radii)
  ).x // Near side
  return rayDirectionECEF.mul(intersection).add(cameraPosition)
})()

export const ellipsoidNormalECEF = Fn(builder => {
  const { ellipsoid } = getAtmosphereContext(builder)
  return positionECEF.div(vec3(ellipsoid.radii).pow2()).normalize()
})()

export const ellipsoidNormalView = Fn(builder => {
  const { matrixECEFToView } = getAtmosphereContext(builder)
  return matrixECEFToView.mul(vec4(ellipsoidNormalECEF, 0)).xyz.normalize()
})()

const rayDirectionECEF = Fn(builder => {
  const { matrixViewToECEF } = getAtmosphereContext(builder)
  return matrixViewToECEF
    .mul(vec4(positionView, 0))
    .xyz.toVarying('rayDirectionECEF')
    .normalize()
})()

const colorNode = mix(materialColor, color(0x020514), 0.8)

const roughnessNode = mix(1, 0.35, layerColor.r)

const specularIntensityNode = mix(0, 1, layerColor.r)

const normalNode = mix(normalView, ellipsoidNormalView, layerColor.r)

export class WaterAreaNodeMaterial extends MeshPhysicalNodeMaterial {
  override ior = 1.33
  override metalness = 0
  override colorNode = colorNode
  override roughnessNode = roughnessNode
  override specularIntensityNode = specularIntensityNode

  override setupNormal(): Node {
    return normalNode
  }
}
