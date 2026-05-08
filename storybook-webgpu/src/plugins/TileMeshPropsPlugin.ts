import { applyProps, type ElementProps } from '@react-three/fiber'
import type { Tile, TilesRenderer } from '3d-tiles-renderer'
import { Mesh, type Object3D } from 'three'

export type TileMeshPropsPluginOptions = Omit<
  ElementProps<typeof Mesh>,
  // Overwriting materials can cause leaks.
  'material'
>

export class TileMeshPropsPlugin {
  tiles?: TilesRenderer
  readonly options: TileMeshPropsPluginOptions

  constructor(options?: TileMeshPropsPluginOptions) {
    this.options = { ...options }
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    this.tiles = tiles

    tiles.forEachLoadedModel((scene, tile) => {
      this.processTileModel(scene, tile)
    })
  }

  // Plugin method
  processTileModel(scene: Object3D, tile: Tile): void {
    scene.traverse(object => {
      if (object instanceof Mesh) {
        // @ts-expect-error This should work.
        applyProps(object, this.options)
      }
    })
  }
}
