import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Briefly holds a direction key — long enough for controls.ts's per-frame update() to issue and
 * record exactly one MOVE_TO to the adjacent tile (a tile takes 200ms at 4 ticks/20Hz, so 100ms
 * releases well before the step completes, before a second one could ever be queued). Unlike a
 * canvas click, this never risks landing on whatever tile a bot now running its own program
 * happens to be passing through — see the additive-recording test below. */
async function tapDirection(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key)
  await page.waitForTimeout(100)
  await page.keyboard.up(key)
  await page.waitForTimeout(400)
}

/**
 * A recorded MOVE_TO always binds absolute (generalisation to nearestOf is M7's job), so the
 * player recording one movement and stopping gives the editor exactly one absolute-bound row to
 * flip to nearestOf. The camera always centres the player on the canvas, so a click one tile
 * size to the right of the canvas' own centre lands one step right of the player's fixed
 * seed-1 start, which a headless check of the same scatter confirmed is always walkable. The
 * canvas fills the browser viewport (M9 fullscreen pass), so its centre — not a fixed pixel
 * offset — has to be measured rather than assumed.
 */
test('player can open a bot’s script and flip a target from absolute to nearestOf', async ({ page }) => {
  await page.goto('/')

  // Deploying a bot now costs materials (M9); stock them via the dev-only test hook rather than
  // simulating minutes of real chopping/mining/farming just to reach the editor.
  await page.evaluate(() => window.__debugStockMk1?.())

  const TILE_SIZE = 32
  const canvas = page.locator('#game')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('#game canvas has no layout box.')
  }

  await page.getByRole('button', { name: 'Record' }).click()
  await canvas.click({ position: { x: box.width / 2 + TILE_SIZE, y: box.height / 2 } })
  // DEPLOY_BOT is gated by the player's own busy check, so wait for the recorded walk (4 ticks
  // at 20Hz) to finish before stopping — otherwise Stop silently fails to deploy the bot.
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Stop' }).click()

  // Stop no longer deploys straight away — it shows the generalised program for review first.
  await page.getByRole('button', { name: 'Assign to bot' }).click()

  // Two now: the free starter bot the player always begins with, plus this newly deployed one —
  // which sorts last, since bot ids only ever increase.
  await expect(page.locator('.bot-list-row')).toHaveCount(2)
  await page.locator('.bot-list-row').last().click()

  const modeSelect = page.locator('.instruction-row:not(.instruction-row-implicit) .arg-editor select').first()
  await expect(modeSelect).toHaveValue('absolute')

  await modeSelect.selectOption('nearestOf')

  await expect(modeSelect).toHaveValue('nearestOf')
  await page.screenshot({ path: 'test-results/editor-nearestof.png' })
})

/**
 * The player starts with one free bot (main.ts), standing one tile left of the player's fixed
 * seed-1 start. Clicking it now only opens its script — recording starts from the Record button
 * inside that panel, and stopping splices the result onto the end of the bot's existing program
 * (EDIT_PROGRAM via program.ts's appendInstructions) rather than replacing it or spawning a new,
 * materials-costed bot the way the toolbar's own Record button does. Recording a second time,
 * after the first program is already assigned, must add to it rather than start over.
 */
test('selecting the free starter bot and pressing Record teaches it a job, additively', async ({ page }) => {
  await page.goto('/')

  const TILE_SIZE = 32
  const canvas = page.locator('#game')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('#game canvas has no layout box.')
  }

  await expect(page.locator('.bot-list-row')).toHaveCount(1)

  // Click the starter bot, one tile left of the player — this only opens its script now. Safe to
  // click directly (rather than tap a key toward it): its program is still empty, so it hasn't
  // moved from its spawn point yet.
  await canvas.click({ position: { x: box.width / 2 - TILE_SIZE, y: box.height / 2 } })
  const scriptEditorRecordButton = page.locator('.script-editor').getByRole('button', { name: /^Record$|^Stop$/ })
  await expect(scriptEditorRecordButton).toHaveText('Record')

  await scriptEditorRecordButton.click()
  await expect(scriptEditorRecordButton).toHaveText('Stop')

  // Record a single step: walk one tile right of spawn.
  await tapDirection(page, 'ArrowRight')

  await scriptEditorRecordButton.click()
  await page.getByRole('button', { name: 'Assign to bot' }).click()

  // Still just the one bot — recording onto it never deploys a second.
  await expect(page.locator('.bot-list-row')).toHaveCount(1)

  // Re-open to force a fresh render of the now-updated program.
  await page.locator('.bot-list-row').click()
  await expect(page.locator('.instruction-row:not(.instruction-row-implicit)')).toHaveCount(1)

  // Record again, now that the bot already has a program — this must add a second step, not
  // replace the first. The bot is now running that first program itself (walking toward the tile
  // just recorded), so a canvas click here could land on the bot mid-transit and open its editor
  // instead of moving the player — a keyboard tap can't be confused that way.
  await scriptEditorRecordButton.click()
  await tapDirection(page, 'ArrowLeft')
  await scriptEditorRecordButton.click()
  await page.getByRole('button', { name: 'Assign to bot' }).click()

  await expect(page.locator('.bot-list-row')).toHaveCount(1)
  await page.locator('.bot-list-row').click()
  await expect(page.locator('.instruction-row:not(.instruction-row-implicit)')).toHaveCount(2)
})

/**
 * While a recording is running for one entry point, the other must visibly refuse to start a
 * second, conflicting one rather than silently stealing or corrupting it.
 */
test('the toolbar Record button is disabled while a script editor recording is running, and vice versa', async ({ page }) => {
  await page.goto('/')

  const TILE_SIZE = 32
  const canvas = page.locator('#game')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('#game canvas has no layout box.')
  }

  await canvas.click({ position: { x: box.width / 2 - TILE_SIZE, y: box.height / 2 } })
  const scriptEditorRecordButton = page.locator('.script-editor').getByRole('button', { name: /^Record$|^Stop$/ })
  const toolbarRecordButton = page.locator('.toolbar').getByRole('button', { name: /^Record$|^Stop$|^Recording/ })

  await scriptEditorRecordButton.click()
  await expect(scriptEditorRecordButton).toHaveText('Stop')
  await expect(toolbarRecordButton).toBeDisabled()

  await scriptEditorRecordButton.click()
  await expect(toolbarRecordButton).toBeEnabled()
  await expect(toolbarRecordButton).toHaveText('Record')
})
