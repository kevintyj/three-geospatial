import { ReorientationPlugin as ReorientationPluginBase } from '3d-tiles-renderer/plugins'

export class ReorientationPlugin extends ReorientationPluginBase {
  update(): void {
    const { lat, lon, height } = this
    if (lat != null && lon != null) {
      this.transformLatLonHeightToOrigin(lat, lon, height)
    }
  }
}
