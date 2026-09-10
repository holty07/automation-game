import { CONTAINER_CAPACITY, totalStored } from './machines'
import type { Condition, TargetRef } from './program'
import type { ResolvedTarget } from './targeting'
import { resolveEntityTarget, resolveTarget } from './targeting'
import type { EntityId, SimState } from './types'
import { getEntity } from './world'

/** Resolves a condition's `container` field down to a storage-bearing entity, or null if nothing
 * matches — the same absolute/nearestOf/marker binding modes any other target uses. */
function resolveContainer(state: SimState, botId: EntityId, container: TargetRef, lastResult: ResolvedTarget | null): EntityId | null {
  const resolved = resolveTarget(state, botId, container, lastResult)
  if (resolved === null) {
    return null
  }
  return resolveEntityTarget(state, resolved, (entity) => entity.storage !== null)
}

/** Evaluates a REPEAT_UNTIL/IF condition against current world state. Never throws — an
 * unresolvable container reference just reads as false, matching "bots never throw". */
export function evaluateCondition(state: SimState, botId: EntityId, condition: Condition, lastResult: ResolvedTarget | null): boolean {
  const actor = getEntity(state, botId)
  if (actor === undefined) {
    return false
  }

  switch (condition.type) {
    case 'HOLDING':
      return actor.held === condition.item
    case 'NOT_HOLDING':
      return actor.held === null
    case 'EXISTS_NEARBY':
      return resolveTarget(state, botId, { mode: 'nearestOf', entityType: condition.entityType, radius: condition.radius }, lastResult) !== null
    case 'CONTAINER_HAS': {
      const containerId = resolveContainer(state, botId, condition.container, lastResult)
      const container = containerId === null ? undefined : getEntity(state, containerId)
      return container?.storage !== null && container?.storage !== undefined && (container.storage[condition.item] ?? 0) > 0
    }
    case 'CONTAINER_FULL': {
      const containerId = resolveContainer(state, botId, condition.container, lastResult)
      const container = containerId === null ? undefined : getEntity(state, containerId)
      return container?.storage !== null && container?.storage !== undefined && totalStored(container.storage) >= CONTAINER_CAPACITY
    }
    case 'INVENTORY_FULL':
      return actor.held !== null
  }
}
