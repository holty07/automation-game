import type { BotTier } from './program'
import type { ItemKind, SimState } from './types'

/**
 * Materials each tier needs, from the design plan's bot-tier table (section 2): Mk1's cost there
 * ("4 planks, 2 blocks") pairs with the resource chain diagram's "Plank + Block + Flour -> Bot
 * Mk1" — the table just omits restating flour, so Mk1 needs all three. Mk2-4 are the incremental
 * cost of upgrading from the previous tier, not a full rebuild.
 */
export const BOT_TIER_COSTS: Record<BotTier, Partial<Record<ItemKind, number>>> = {
  mk1: { plank: 4, block: 2, flour: 1 },
  mk2: { gear: 2 },
  mk3: { circuit: 1 },
  mk4: { core: 1 },
}

const TIER_SEQUENCE: readonly BotTier[] = ['mk1', 'mk2', 'mk3', 'mk4']

/** The next tier up from `tier`, or null if it's already the highest. */
export function nextTier(tier: BotTier): BotTier | null {
  const index = TIER_SEQUENCE.indexOf(tier)
  if (index === -1 || index === TIER_SEQUENCE.length - 1) {
    return null
  }
  return TIER_SEQUENCE[index + 1] ?? null
}

/** Total of `item` held across every stockpile in the world — costs are paid from the world's
 * combined stock, not any single stockpile, so the player doesn't need to funnel everything
 * through one building. */
function totalStocked(state: SimState, item: ItemKind): number {
  let total = 0
  for (const entity of state.entities) {
    if (entity.type === 'stockpile' && entity.storage !== null) {
      total += entity.storage[item] ?? 0
    }
  }
  return total
}

/** Whether every stockpile in the world, combined, holds enough to cover `cost`. */
export function hasStockedCost(state: SimState, cost: Partial<Record<ItemKind, number>>): boolean {
  return (Object.entries(cost) as [ItemKind, number][]).every(([item, count]) => totalStocked(state, item) >= count)
}

/** Deducts `cost` from stockpiles across the world. Callers must check `hasStockedCost` first —
 * this does not fail partway if stock runs short, it just takes whatever is there. */
export function deductStockedCost(state: SimState, cost: Partial<Record<ItemKind, number>>): void {
  for (const [item, count] of Object.entries(cost) as [ItemKind, number][]) {
    let remaining = count
    for (const entity of state.entities) {
      if (remaining <= 0) {
        break
      }
      if (entity.type !== 'stockpile' || entity.storage === null) {
        continue
      }
      const have = entity.storage[item] ?? 0
      const take = Math.min(have, remaining)
      if (take > 0) {
        entity.storage[item] = have - take
        remaining -= take
      }
    }
  }
}
