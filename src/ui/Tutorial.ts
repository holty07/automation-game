import type { SimState } from '../sim/types'

interface Hint {
  text: string
  /** Checked only while this is the active (first incomplete) hint — once true, it advances for
   * good and is never re-checked, so later consuming the materials it asked for doesn't undo it. */
  isComplete(state: SimState): boolean
}

const HINTS: readonly Hint[] = [
  {
    text: 'Chop a tree — click one nearby to gather a log.',
    isComplete: (state) => state.entities.some((entity) => entity.type === 'log'),
  },
  {
    text: 'Craft: build a bench saw, feed it logs and stone for planks and blocks. Till, sow, harvest and mill wheat for flour.',
    isComplete: (state) =>
      state.entities.some((entity) => entity.type === 'plank') &&
      state.entities.some((entity) => entity.type === 'block') &&
      state.entities.some((entity) => entity.type === 'flour'),
  },
  {
    text: 'Stock 4 planks, 2 blocks and 1 flour in a stockpile, then Record a task, Stop, and Assign it to build your first bot.',
    isComplete: (state) => state.entities.some((entity) => entity.type === 'bot'),
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
    const hint = HINTS[index]
    if (hint === undefined) {
      panel.hidden = true
      return
    }
    panel.hidden = false
    step.textContent = `Step ${index + 1}/${HINTS.length}:`
    text.textContent = hint.text
  }

  render()

  return {
    notifyEditorOpened(): void {
      editorOpened = true
    },
    update(): void {
      const hint = HINTS[index]
      if (hint === undefined) {
        return
      }
      const done = index === HINTS.length - 1 ? editorOpened : hint.isComplete(state)
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
