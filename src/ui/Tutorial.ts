import type { ItemKind, SimState } from '../sim/types'

interface Hint {
  text: string
  /** Checked only while this is the active (first incomplete) hint — once true, it advances for
   * good and is never re-checked, so later consuming the materials it asked for doesn't undo it. */
  isComplete(state: SimState): boolean
}

/** True once at least one entity of `type` exists anywhere in the world. Only meaningful for
 * buildings and bots, which are always their own standalone entity. */
function hasEntity(state: SimState, type: string): boolean {
  return state.entities.some((entity) => entity.type === type)
}

/** True once `kind` exists anywhere: as a ground item, held by an actor, or sitting in some
 * machine's or container's storage. Crafted materials (planks, blocks, flour) are produced
 * straight into the bench saw's/mill's own storage, then usually carried by hand or into a
 * stockpile -- they rarely ever touch the ground, so checking only for a standalone item entity
 * (as hasEntity does) would almost never trigger. */
function hasItem(state: SimState, kind: ItemKind): boolean {
  return state.entities.some((entity) => entity.type === kind || entity.held === kind || (entity.storage?.[kind] ?? 0) > 0)
}

export const TUTORIAL_HINTS: readonly Hint[] = [
  {
    text: 'Chop a tree — click one nearby to gather a log.',
    isComplete: (state) => hasItem(state, 'log'),
  },
  {
    text: 'Click Build Stockpile, then click an empty tile nearby to place it. Carry logs over and give them to it — hover over it to see what it still needs.',
    isComplete: (state) => hasEntity(state, 'stockpile'),
  },
  {
    text: "Build a bench saw the same way — it needs logs and stone delivered before it's finished.",
    isComplete: (state) => hasEntity(state, 'benchSaw'),
  },
  {
    text: 'Once your bench saw is built, feed it logs for planks and stone for blocks.',
    isComplete: (state) => hasItem(state, 'plank') && hasItem(state, 'block'),
  },
  {
    text: 'Build a mill the same way — it needs planks and a block delivered.',
    isComplete: (state) => hasEntity(state, 'mill'),
  },
  {
    text: 'Till a patch of soil, sow it, wait for the wheat to grow, harvest it, then feed the grain to your mill for flour.',
    isComplete: (state) => hasItem(state, 'flour'),
  },
  {
    text: 'Stock 4 planks, 2 blocks and 1 flour in a stockpile, then Record yourself chopping a tree, Stop, and Assign it to build your first bot.',
    isComplete: (state) => hasEntity(state, 'bot'),
  },
  {
    text: 'Click your bot in the list to open its script and see what it is doing.',
    isComplete: () => false, // advanced explicitly via notifyEditorOpened(), never by polling state
  },
]

export interface Tutorial {
  /** Records that the player opened a bot's script editor at least once — completes the final hint. */
  notifyEditorOpened(): void
  /** Call once per frame: advances the hint queue and refreshes its display. */
  update(): void
  destroy(): void
}

export function createTutorial(container: HTMLElement, state: SimState): Tutorial {
  let index = 0
  let editorOpened = false

  const panel = document.createElement('div')
  panel.className = 'tutorial'
  container.append(panel)

  const step = document.createElement('span')
  step.className = 'tutorial-step'
  const text = document.createElement('span')
  text.className = 'tutorial-text'
  panel.append(step, text)

  function render(): void {
    const hint = TUTORIAL_HINTS[index]
    if (hint === undefined) {
      panel.hidden = true
      return
    }
    panel.hidden = false
    step.textContent = `Step ${index + 1}/${TUTORIAL_HINTS.length}:`
    text.textContent = hint.text
  }

  render()

  return {
    notifyEditorOpened(): void {
      editorOpened = true
    },
    update(): void {
      const hint = TUTORIAL_HINTS[index]
      if (hint === undefined) {
        return
      }
      const done = index === TUTORIAL_HINTS.length - 1 ? editorOpened : hint.isComplete(state)
      if (done) {
        index += 1
        render()
      }
    },
    destroy(): void {
      panel.remove()
    },
  }
}
