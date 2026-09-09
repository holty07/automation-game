export interface Camera {
  tileSize: number
  viewportWidth: number
  viewportHeight: number
}

export function createCamera(tileSize: number, viewportWidth: number, viewportHeight: number): Camera {
  return { tileSize, viewportWidth, viewportHeight }
}

export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

export interface ScreenPoint {
  x: number
  y: number
}

/** Converts a tile position to screen pixels, given the camera is centred on (followX, followY). */
export function tileToScreen(
  camera: Camera,
  followX: number,
  followY: number,
  tileX: number,
  tileY: number,
): ScreenPoint {
  const originX = camera.viewportWidth / 2 - (followX + 0.5) * camera.tileSize
  const originY = camera.viewportHeight / 2 - (followY + 0.5) * camera.tileSize
  return {
    x: originX + tileX * camera.tileSize,
    y: originY + tileY * camera.tileSize,
  }
}

/** Inverse of tileToScreen: the tile under a screen pixel, given the camera's follow point. */
export function screenToTile(
  camera: Camera,
  followX: number,
  followY: number,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const origin = tileToScreen(camera, followX, followY, 0, 0)
  return {
    x: Math.floor((screenX - origin.x) / camera.tileSize),
    y: Math.floor((screenY - origin.y) / camera.tileSize),
  }
}

export interface TileBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Range of tile coordinates visible on screen, clamped to the world, for culling. */
export function visibleTileBounds(
  camera: Camera,
  followX: number,
  followY: number,
  worldWidth: number,
  worldHeight: number,
): TileBounds {
  const halfTilesX = camera.viewportWidth / 2 / camera.tileSize
  const halfTilesY = camera.viewportHeight / 2 / camera.tileSize

  return {
    minX: Math.max(0, Math.floor(followX - halfTilesX)),
    maxX: Math.min(worldWidth - 1, Math.ceil(followX + halfTilesX)),
    minY: Math.max(0, Math.floor(followY - halfTilesY)),
    maxY: Math.min(worldHeight - 1, Math.ceil(followY + halfTilesY)),
  }
}
