import { expect, test } from '@playwright/test'

/**
 * A harvest leaves tilled soil and the grain it yielded sharing the same tile (see
 * useVerb.ts's useWheat) — a renewable stone deposit does the same with the stone it just
 * yielded. Clicking that tile must pick up the loose item, not re-trigger the resource (which
 * would always be there to re-match, making the item permanently unclickable) — see controls.ts's
 * item-before-resource ordering.
 */
test('clicking a tile with both a persistent resource and a loose item picks up the item', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.__debugSpawnHarvestedPatch?.())

  const TILE_SIZE = 32
  const canvas = page.locator('#game')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('#game canvas has no layout box.')
  }

  await expect(page.locator('.toolbar span').first()).toHaveText('Holding: nothing')

  // The patch sits one tile right of the player, already adjacent — no walk needed first.
  await canvas.click({ position: { x: box.width / 2 + TILE_SIZE, y: box.height / 2 } })
  await page.waitForTimeout(500)

  await expect(page.locator('.toolbar span').first()).toHaveText('Holding: grain')
})
