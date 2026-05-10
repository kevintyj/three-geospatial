import workerpool from 'workerpool'

import { computeCreasedNormalAttribute } from './tasks/computeCreasedNormalAttribute'
import { computeWaterAreaTileImage } from './tasks/computeWaterAreaTileImage'

export const methods = {
  computeCreasedNormalAttribute,
  computeWaterAreaTileImage
}

workerpool.worker(methods)
