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

/**
 * USE:tree costs 40 ticks (~2s at 20Hz) of busyUntilTick cooldown after the chop itself (which
 * happens instantly — the tree is removed and the log dropped the moment the action commits; see
 * useVerb.ts's useResource). A click that lands while the player is still mid-cooldown used to be
 * dropped outright — controls.ts's onClick resolved it immediately, executeAction's isActorBusy
 * gate failed it, and nothing was queued to retry — so the player had to notice nothing happened
 * and click the log a second time. It's now deferred and replayed automatically once the player is
 * free (see controls.ts's pendingClick), so a single click on the log, even mid-cooldown, is
 * enough.
 */
test('clicking the dropped log mid-cooldown, right after chopping, still picks it up without a second click', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.__debugSpawnTree?.())

  const TILE_SIZE = 32
  const canvas = page.locator('#game')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('#game canvas has no layout box.')
  }

  await expect(page.locator('.toolbar span').first()).toHaveText('Holding: nothing')

  // The tree sits one tile above (north of) the player, already adjacent — no walk needed first.
  const treeTile = { x: box.width / 2, y: box.height / 2 - TILE_SIZE }
  await canvas.click({ position: treeTile })

  // Click the same tile again — where the dropped log now sits — well before the chop's own
  // cooldown (~2s) has elapsed, so this click lands squarely mid-cooldown.
  await page.waitForTimeout(600)
  await canvas.click({ position: treeTile })

  // No second click from here — if the click above was silently dropped instead of deferred,
  // holding would still read "nothing" forever.
  await page.waitForTimeout(2000)
  await expect(page.locator('.toolbar span').first()).toHaveText('Holding: log')
})
