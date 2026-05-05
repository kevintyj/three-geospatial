import { useEffect, useState, type ComponentProps, type FC } from 'react'
import type { Mesh, MeshPhysicalMaterial } from 'three'
import { DRACOLoader, GLTFLoader } from 'three/examples/jsm/Addons.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MeshPhysicalNodeMaterial } from 'three/webgpu'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)
gltfLoader.setMeshoptDecoder(MeshoptDecoder)

export interface DragonProps extends ComponentProps<'mesh'> {}

export const Dragon: FC<DragonProps> = props => {
  const [mesh, setMesh] = useState<Mesh>()

  useEffect(() => {
    gltfLoader.load('public/dragon_attenuation.glb', gltf => {
      const mesh = gltf.scene.getObjectByName('Dragon') as Mesh
      const material = new MeshPhysicalNodeMaterial(
        mesh.material as MeshPhysicalMaterial
      )
      mesh.material = material
      setMesh(mesh)
    })
  }, [])

  return mesh != null ? <primitive object={mesh} {...props} /> : null
}
