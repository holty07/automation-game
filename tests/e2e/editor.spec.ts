import { expect, test } from '@playwright/test'

/**
 * A recorded MOVE_TO always binds absolute (generalisation to nearestOf is M7's job), so the
 * player recording one movement and stopping gives the editor exactly one absolute-bound row to
 * flip to nearestOf. The clicked tile is one step right of the player's fixed seed-1 start, which
 * a headless check of the same scatter confirmed is always walkable.
 */
test('player can open a bot’s script and flip a target from absolute to nearestOf', async ({ page }) => {
  await page.goto('/')

  // Deploying a bot now costs materials (M9); stock them via the dev-only test hook rather than
  // simulating minutes of real chopping/mining/farming just to reach the editor.
  await page.evaluate(() => window.__debugStockMk1?.())

  await page.getByRole('button', { name: 'Record' }).click()
  await page.locator('#game').click({ position: { x: 432, y: 300 } })
  // DEPLOY_BOT is gated by the player's own busy check, so wait for the recorded walk (4 ticks
  // at 20Hz) to finish before stopping — otherwise Stop silently fails to deploy the bot.
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Stop' }).click()

  // Stop no longer deploys straight away — it shows the generalised program for review first.
  await page.getByRole('button', { name: 'Assign to bot' }).click()

  await expect(page.locator('.bot-list-row')).toHaveCount(1)
  await page.locator('.bot-list-row').click()

  const modeSelect = page.locator('.instruction-row:not(.instruction-row-implicit) .arg-editor select').first()
  await expect(modeSelect).toHaveValue('absolute')

  await modeSelect.selectOption('nearestOf')

  await expect(modeSelect).toHaveValue('nearestOf')
  await page.screenshot({ path: 'test-results/editor-nearestof.png' })
})
