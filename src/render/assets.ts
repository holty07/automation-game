import type { EntityType, TileType } from '../sim/types'

/**
 * Auto-discovers sprite art dropped into src/assets/sprites/{tiles,entities}/<id>.png — the
 * designer drops a file named after the exact TileType/EntityType id and it's picked up here
 * with no code change. Anything not yet dropped in (or still decoding) falls back to the flat
 * colour placeholder in sprites.ts.
 */
const tileSources = import.meta.glob('../assets/sprites/tiles/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const entitySources = import.meta.glob('../assets/sprites/entities/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function idFromPath(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.png$/, '')
}

/** No-op outside a browser (e.g. Vitest's node test environment, which has no Image global) —
 * callers see an empty map and fall back to the flat colour placeholder, same as art not yet
 * dropped in. */
function loadImages(sources: Record<string, string>): Map<string, HTMLImageElement> {
  const images = new Map<string, HTMLImageElement>()
  if (typeof Image === 'undefined') {
    return images
  }
  for (const [path, url] of Object.entries(sources)) {
    const image = new Image()
    image.src = url
    images.set(idFromPath(path), image)
  }
  return images
}

const tileImages = loadImages(tileSources)
const entityImages = loadImages(entitySources)

/** The loaded sprite for a tile, or null if no art has been dropped in yet (or it hasn't
 * finished decoding), so the renderer can fall back to the flat colour placeholder. */
export function tileImage(tile: TileType): HTMLImageElement | null {
  const image = tileImages.get(tile)
  return image !== undefined && image.complete && image.naturalWidth > 0 ? image : null
}

/** The loaded sprite for an entity/item type, or null — see tileImage. */
export function entityImage(type: EntityType): HTMLImageElement | null {
  const image = entityImages.get(type)
  return image !== undefined && image.complete && image.naturalWidth > 0 ? image : null
}
