import {
  cameraPosition,
  color,
  Fn,
  materialColor,
  mix,
  normalView,
  positionView,
  property,
  vec3,
  vec4
} from 'three/tsl'
import {
  MeshPhysicalNodeMaterial,
  type Node,
  type NodeBuilder
} from 'three/webgpu'

import { getAtmosphereContext } from '@takram/three-atmosphere/webgpu'
import { rayEllipsoidIntersection } from '@takram/three-geospatial/webgpu'

export const waterAreaMask = property('float', 'waterAreaMask')

const positionECEF = Fn(builder => {
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

const ellipsoidNormalECEF = Fn(builder => {
  const { ellipsoid } = getAtmosphereContext(builder)
  return positionECEF.div(vec3(ellipsoid.radii).pow2()).normalize()
})()

const ellipsoidNormalView = Fn(builder => {
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

const colorNode = mix(materialColor, color(0x020514), waterAreaMask.mul(0.8))

const roughnessNode = mix(1, 0.35, waterAreaMask)

const specularIntensityNode = mix(0, 1, waterAreaMask)

const normalNode = mix(normalView, ellipsoidNormalView, waterAreaMask)

export class WaterAreaNodeMaterial extends MeshPhysicalNodeMaterial {
  override ior = 1.33
  override metalness = 0
  override colorNode = colorNode
  override roughnessNode = roughnessNode
  override specularIntensityNode = specularIntensityNode

  waterAreaMaskNode: Node = vec3(0)

  override setupDiffuseColor(builder: NodeBuilder): void {
    // waterAreaMask must be assigned here since colorNode depends on it.
    waterAreaMask.assign(this.waterAreaMaskNode)
    super.setupDiffuseColor(builder)
  }

  override setupNormal(): Node {
    return normalNode
  }
}
