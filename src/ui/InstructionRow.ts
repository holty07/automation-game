import type { Condition, RepeatParams, TargetRef } from '../sim/program'
import type { EntityType, ItemKind } from '../sim/types'
import type { DropPosition, FlatRow } from './instructionTree'

const OPCODE_LABELS: Record<string, string> = {
  MOVE_TO: 'Move to',
  PICK_UP: 'Pick up',
  DROP: 'Drop',
  USE: 'Use',
  GIVE_TO: 'Give to',
  TAKE_FROM: 'Take from',
  REPEAT: 'Repeat',
  REPEAT_UNTIL: 'Repeat until',
  IF: 'If',
  WAIT: 'Wait',
  CALL: 'Call routine',
}

/** Entity types a bot might sensibly aim a target at — everything but the actors themselves. */
const TARGETABLE_ENTITY_TYPES: EntityType[] = [
  'tree',
  'rock',
  'soil',
  'tilledSoil',
  'wheat',
  'stockpile',
  'benchSaw',
  'mill',
  'blueprint',
  'log',
  'stone',
  'plank',
  'block',
  'grain',
  'flour',
  'gear',
  'circuit',
  'core',
]

const ITEM_OPTIONS: ItemKind[] = ['log', 'stone', 'plank', 'block', 'grain', 'flour', 'gear', 'circuit', 'core']

const BINDING_MODE_LABELS: Record<TargetRef['mode'], string> = {
  absolute: 'Exact tile',
  nearestOf: 'Nearest of type',
  inArea: 'Nearest in area',
  held: 'Held item',
  lastResult: 'Last result',
  marker: 'Marker',
}

const CONDITION_TYPE_LABELS: Record<Condition['type'], string> = {
  HOLDING: 'Holding',
  NOT_HOLDING: 'Not holding anything',
  EXISTS_NEARBY: 'Exists nearby',
  CONTAINER_HAS: 'Container has',
  CONTAINER_FULL: 'Container is full',
  INVENTORY_FULL: 'Hands are full',
}

export interface InstructionRowCallbacks {
  onDelete(id: string): void
  onDuplicate(id: string): void
  onArgChange(id: string, ref: TargetRef): void
  onItemChange(id: string, item: ItemKind): void
  onRepeatParamsChange(id: string, params: RepeatParams): void
  onConditionChange(id: string, condition: Condition): void
  onWaitTicksChange(id: string, ticks: number): void
  onRoutineIdChange(id: string, routineId: string): void
  onMove(sourceId: string, targetId: string, position: DropPosition): void
}

function createSelect<T extends string>(
  options: readonly { value: T; label: string }[],
  selected: T,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const select = document.createElement('select')
  for (const option of options) {
    const entry = document.createElement('option')
    entry.value = option.value
    entry.textContent = option.label
    select.append(entry)
  }
  select.value = selected
  select.addEventListener('change', () => onChange(select.value as T))
  return select
}

function createNumberInput(value: number, label: string, onChange: (value: number) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.setAttribute('aria-label', label)
  input.value = String(value)
  input.addEventListener('change', () => {
    const parsed = Number(input.value)
    if (!Number.isNaN(parsed)) {
      onChange(parsed)
    }
  })
  return input
}

function createTextInput(value: string, label: string, onChange: (value: string) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.setAttribute('aria-label', label)
  input.value = value
  input.addEventListener('change', () => onChange(input.value))
  return input
}

/** A binding mode's default payload, reusing whatever compatible fields `previous` already had. */
function defaultTargetRef(mode: TargetRef['mode'], previous: TargetRef): TargetRef {
  const entityType = 'entityType' in previous ? previous.entityType : 'tree'
  switch (mode) {
    case 'absolute':
      return { mode: 'absolute', tile: previous.mode === 'absolute' ? previous.tile : { x: 0, y: 0 } }
    case 'nearestOf':
      return { mode: 'nearestOf', entityType }
    case 'inArea':
      return { mode: 'inArea', entityType, areaId: previous.mode === 'inArea' ? previous.areaId : 'area-1' }
    case 'held':
      return { mode: 'held' }
    case 'lastResult':
      return { mode: 'lastResult' }
    case 'marker':
      return { mode: 'marker', markerId: previous.mode === 'marker' ? previous.markerId : 'marker-1' }
  }
}

/** The dropdown(s) specific to a binding mode: an entity type, a tile, or a named id. */
function createTargetControl(ref: TargetRef, onChange: (ref: TargetRef) => void): HTMLElement {
  const span = document.createElement('span')
  switch (ref.mode) {
    case 'absolute': {
      const x = createNumberInput(ref.tile.x, 'target x', (value) => onChange({ ...ref, tile: { ...ref.tile, x: value } }))
      const y = createNumberInput(ref.tile.y, 'target y', (value) => onChange({ ...ref, tile: { ...ref.tile, y: value } }))
      span.append(x, y)
      return span
    }
    case 'nearestOf': {
      const type = createSelect(
        TARGETABLE_ENTITY_TYPES.map((entityType) => ({ value: entityType, label: entityType })),
        ref.entityType,
        (entityType) => onChange({ ...ref, entityType }),
      )
      span.append(type)
      return span
    }
    case 'inArea': {
      const type = createSelect(
        TARGETABLE_ENTITY_TYPES.map((entityType) => ({ value: entityType, label: entityType })),
        ref.entityType,
        (entityType) => onChange({ ...ref, entityType }),
      )
      const areaId = createTextInput(ref.areaId, 'area id', (value) => onChange({ ...ref, areaId: value }))
      span.append(type, areaId)
      return span
    }
    case 'marker': {
      const markerId = createTextInput(ref.markerId, 'marker id', (value) => onChange({ ...ref, markerId: value }))
      span.append(markerId)
      return span
    }
    case 'held':
    case 'lastResult':
      return span
  }
}

function createArgEditor(ref: TargetRef, onChange: (ref: TargetRef) => void): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'arg-editor'
  const modeOptions = (Object.keys(BINDING_MODE_LABELS) as TargetRef['mode'][]).map((mode) => ({
    value: mode,
    label: BINDING_MODE_LABELS[mode],
  }))
  const modeSelect = createSelect(modeOptions, ref.mode, (mode) => onChange(defaultTargetRef(mode, ref)))
  wrap.append(modeSelect, createTargetControl(ref, onChange))
  return wrap
}

function createRepeatEditor(params: RepeatParams | undefined, onChange: (params: RepeatParams) => void): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'arg-editor'
  const current = params ?? { mode: 'forever' }
  const modeSelect = createSelect(
    [
      { value: 'forever', label: 'forever' },
      { value: 'count', label: 'times' },
    ] as const,
    current.mode,
    (mode) => onChange(mode === 'forever' ? { mode: 'forever' } : { mode: 'count', count: 1 }),
  )
  wrap.append(modeSelect)
  if (current.mode === 'count') {
    wrap.append(createNumberInput(current.count, 'repeat count', (count) => onChange({ mode: 'count', count })))
  }
  return wrap
}

/** A condition type's default payload, reusing whatever compatible fields `previous` already had. */
function defaultCondition(type: Condition['type'], previous: Condition): Condition {
  const container = 'container' in previous ? previous.container : ({ mode: 'nearestOf', entityType: 'stockpile' } as const)
  switch (type) {
    case 'HOLDING':
      return { type: 'HOLDING', item: previous.type === 'HOLDING' ? previous.item : 'log' }
    case 'NOT_HOLDING':
      return { type: 'NOT_HOLDING' }
    case 'EXISTS_NEARBY':
      return { type: 'EXISTS_NEARBY', entityType: previous.type === 'EXISTS_NEARBY' ? previous.entityType : 'tree' }
    case 'CONTAINER_HAS':
      return { type: 'CONTAINER_HAS', container, item: previous.type === 'CONTAINER_HAS' ? previous.item : 'log' }
    case 'CONTAINER_FULL':
      return { type: 'CONTAINER_FULL', container }
    case 'INVENTORY_FULL':
      return { type: 'INVENTORY_FULL' }
  }
}

/** REPEAT_UNTIL and IF's condition: a type select, then per-type sub-controls. */
function createConditionEditor(condition: Condition | undefined, onChange: (condition: Condition) => void): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'condition-editor'
  const current = condition ?? { type: 'NOT_HOLDING' }

  const typeOptions = (Object.keys(CONDITION_TYPE_LABELS) as Condition['type'][]).map((type) => ({
    value: type,
    label: CONDITION_TYPE_LABELS[type],
  }))
  wrap.append(createSelect(typeOptions, current.type, (type) => onChange(defaultCondition(type, current))))

  switch (current.type) {
    case 'HOLDING':
      wrap.append(
        createSelect(
          ITEM_OPTIONS.map((item) => ({ value: item, label: item })),
          current.item,
          (item) => onChange({ ...current, item }),
        ),
      )
      break
    case 'EXISTS_NEARBY':
      wrap.append(
        createSelect(
          TARGETABLE_ENTITY_TYPES.map((entityType) => ({ value: entityType, label: entityType })),
          current.entityType,
          (entityType) => onChange({ ...current, entityType }),
        ),
      )
      break
    case 'CONTAINER_HAS':
      wrap.append(createArgEditor(current.container, (container) => onChange({ ...current, container })))
      wrap.append(
        createSelect(
          ITEM_OPTIONS.map((item) => ({ value: item, label: item })),
          current.item,
          (item) => onChange({ ...current, item }),
        ),
      )
      break
    case 'CONTAINER_FULL':
      wrap.append(createArgEditor(current.container, (container) => onChange({ ...current, container })))
      break
    case 'NOT_HOLDING':
    case 'INVENTORY_FULL':
      break
  }

  return wrap
}

/** Builds a fresh DOM row for one instruction. Rebuilt wholesale on every edit — instruction
 * counts are small enough that there's no need to patch an existing row in place. */
export function createInstructionRow(row: FlatRow, highlighted: boolean, callbacks: InstructionRowCallbacks): HTMLElement {
  const { instruction, depth, isImplicitRoot } = row

  const element = document.createElement('div')
  element.className = 'instruction-row'
  element.dataset.instructionId = instruction.id
  element.style.paddingLeft = `${depth * 20}px`
  if (highlighted) {
    element.classList.add('instruction-row-active')
  }
  if (isImplicitRoot) {
    element.classList.add('instruction-row-implicit')
  }

  const handle = document.createElement('span')
  handle.className = 'drag-handle'
  handle.textContent = '⠿'
  element.append(handle)

  if (!isImplicitRoot) {
    element.draggable = true
    element.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', instruction.id)
    })
  }
  element.addEventListener('dragover', (event) => {
    event.preventDefault()
    const rect = element.getBoundingClientRect()
    const fraction = (event.clientY - rect.top) / rect.height
    const canDropInto = instruction.op === 'REPEAT' || instruction.op === 'REPEAT_UNTIL' || instruction.op === 'IF'
    const position: DropPosition = canDropInto && fraction > 0.33 && fraction < 0.67 ? 'into' : fraction < 0.5 ? 'before' : 'after'
    element.dataset.dropPosition = position
    element.classList.add(`drop-${position}`)
  })
  element.addEventListener('dragleave', () => {
    element.classList.remove('drop-before', 'drop-after', 'drop-into')
  })
  element.addEventListener('drop', (event) => {
    event.preventDefault()
    element.classList.remove('drop-before', 'drop-after', 'drop-into')
    const sourceId = event.dataTransfer?.getData('text/plain')
    const position = element.dataset.dropPosition as DropPosition | undefined
    if (sourceId !== undefined && sourceId !== '' && position !== undefined) {
      callbacks.onMove(sourceId, instruction.id, position)
    }
  })

  const label = document.createElement('span')
  label.className = 'opcode-label'
  label.textContent = OPCODE_LABELS[instruction.op] ?? instruction.op
  element.append(label)

  if (instruction.op === 'REPEAT') {
    element.append(createRepeatEditor(instruction.params, (params) => callbacks.onRepeatParamsChange(instruction.id, params)))
  } else if (instruction.op === 'REPEAT_UNTIL' || instruction.op === 'IF') {
    element.append(createConditionEditor(instruction.condition, (condition) => callbacks.onConditionChange(instruction.id, condition)))
  } else if (instruction.op === 'WAIT') {
    element.append(createNumberInput(instruction.waitTicks ?? 20, 'wait ticks', (ticks) => callbacks.onWaitTicksChange(instruction.id, ticks)))
  } else if (instruction.op === 'CALL') {
    element.append(createTextInput(instruction.routineId ?? '', 'routine id', (routineId) => callbacks.onRoutineIdChange(instruction.id, routineId)))
  } else {
    const ref = instruction.args[0]
    if (ref !== undefined) {
      element.append(createArgEditor(ref, (next) => callbacks.onArgChange(instruction.id, next)))
    }
  }

  if (instruction.op === 'TAKE_FROM') {
    const itemSelect = createSelect(
      ITEM_OPTIONS.map((item) => ({ value: item, label: item })),
      instruction.item ?? 'log',
      (item) => callbacks.onItemChange(instruction.id, item),
    )
    element.append(itemSelect)
  }

  if (!isImplicitRoot) {
    const duplicateButton = document.createElement('button')
    duplicateButton.textContent = 'Duplicate'
    duplicateButton.addEventListener('click', () => callbacks.onDuplicate(instruction.id))
    element.append(duplicateButton)

    const deleteButton = document.createElement('button')
    deleteButton.textContent = 'Delete'
    deleteButton.addEventListener('click', () => callbacks.onDelete(instruction.id))
    element.append(deleteButton)
  }

  return element
}
