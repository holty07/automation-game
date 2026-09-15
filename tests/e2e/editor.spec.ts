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

  const TILE_SIZE = 32
  const canvas = page.locator('#game')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('#game canvas has no layout box.')
  }

  // The free starter bot, one tile left of the player — recording onto it needs no materials or
  // blueprint, so it's the quickest way to reach an editor row with a target to flip.
  await canvas.click({ position: { x: box.width / 2 - TILE_SIZE, y: box.height / 2 } })
  await page.locator('.script-editor').getByRole('button', { name: 'Record' }).click()
  await canvas.click({ position: { x: box.width / 2 + TILE_SIZE, y: box.height / 2 } })
  await page.waitForTimeout(800)
  await page.locator('.script-editor').getByRole('button', { name: 'Stop' }).click()

  // Stop shows the generalised program for review before splicing it onto the bot's program.
  await page.getByRole('button', { name: 'Assign to bot' }).click()

  // Re-open to force a fresh render of the now-updated program.
  await page.locator('.bot-list-row').click()

  const modeSelect = page.locator('.instruction-row:not(.instruction-row-implicit) .arg-editor select').first()
  await expect(modeSelect).toHaveValue('absolute')

  await modeSelect.selectOption('nearestOf')

  await expect(modeSelect).toHaveValue('nearestOf')
  await page.screenshot({ path: 'test-results/editor-nearestof.png' })
})

/**
 * The player starts with one free bot (main.ts), standing one tile left of the player's fixed
 * seed-1 start. Clicking it now only opens its script — recording starts from the Record button
 * inside that panel. Each step is written straight onto the bot's live program the instant it's
 * captured (Toolbar.ts's appendLiveInstruction), so the open script editor visibly grows mid-
 * recording, not just once Stop is clicked; stopping then replaces that raw tail with the
 * generalised, reviewed result (EDIT_PROGRAM via program.ts's appendInstructions) rather than
 * appending a second time. New bots are built from a materials-costed blueprint instead (see
 * Toolbar.ts) — recording never spawns one. Recording a second time, after the first program is
 * already assigned, must add to it rather than start over.
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

  // Live: the step is already sitting in the bot's program mid-recording, well before Stop —
  // the panel is still open on this same bot, so it re-renders on its own (ScriptEditor.update()).
  await expect(page.locator('.instruction-row:not(.instruction-row-implicit)')).toHaveCount(1)

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
 * Only one script editor panel exists, but recording is tied to whichever bot it was started for,
 * not to whichever bot the panel currently shows — switching the panel to a different bot mid-
 * recording must not let that bot silently steal or corrupt it, so its own Record button visibly
 * refuses to start a second, conflicting recording.
 */
test('a second bot’s Record button is disabled while another bot’s recording is running', async ({ page }) => {
  await page.goto('/')

  // A second bot, independent of the free starter bot, without placing and stocking a blueprint.
  await page.evaluate(() => window.__debugBuildBot?.())

  const TILE_SIZE = 32
  const canvas = page.locator('#game')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('#game canvas has no layout box.')
  }
  await expect(page.locator('.bot-list-row')).toHaveCount(2)

  const recordButton = page.locator('.script-editor').getByRole('button', { name: /^Record$|^Stop$|^Recording/ })

  // Open the starter bot (one tile left of the player) and start recording onto it.
  await canvas.click({ position: { x: box.width / 2 - TILE_SIZE, y: box.height / 2 } })
  await recordButton.click()
  await expect(recordButton).toHaveText('Stop')

  // Switch the panel to the second bot without stopping — its own button must refuse to record.
  await page.locator('.bot-list-row').last().click()
  await expect(recordButton).toBeDisabled()
  await expect(recordButton).toHaveText('Recording elsewhere…')

  // Switching back to the bot actually recording shows its own Stop button, live, again.
  await page.locator('.bot-list-row').first().click()
  await expect(recordButton).toBeEnabled()
  await expect(recordButton).toHaveText('Stop')
  await recordButton.click()
})
