import { entityIconUrl } from '../render/assets'
import type { BuildableType } from '../sim/actions'

type BuildCategoryKey = 'buildings' | 'bots'

interface BuildCategory {
  key: BuildCategoryKey
  label: string
  choices: readonly BuildableType[]
}

/** The buildings/bots split the icon nav groups choices into. Bots gets its own top-level
 * category — rather than folding its one choice into Buildings — since more bot kinds/tiers are
 * expected to land here later. */
const CATEGORIES: readonly BuildCategory[] = [
  { key: 'buildings', label: 'Buildings', choices: ['stockpile', 'benchSaw', 'mill'] },
  { key: 'bots', label: 'Bots', choices: ['bot'] },
]

const BUILD_LABELS: Record<BuildableType, string> = {
  stockpile: 'Stockpile',
  benchSaw: 'Bench Saw',
  mill: 'Mill',
  bot: 'Bot',
}

export interface BuildMenuCallbacks {
  /** Fired when the player clicks a buildable's icon in an open submenu. The caller owns the
   * actual armed/`pending` state — toggling it off again if `choice` was already armed is the
   * caller's call, not this menu's. */
  onSelect(choice: BuildableType): void
}

export interface BuildMenu {
  /** Reflects which choice (if any) is currently armed — highlights its icon and the category it
   * lives under, and updates the armed-state label. Call whenever `pending` might have changed
   * (arming, disarming, or a tile placing it and clearing it back to null). */
  render(pending: BuildableType | null): void
  destroy(): void
}

function categoryOf(choice: BuildableType): BuildCategory | undefined {
  return CATEGORIES.find((category) => category.choices.includes(choice))
}

/** An icon button: the buildable's own sprite (already loading for the world renderer — see
 * render/assets.ts) above a short text label, so the nav reads as icon-based without leaving a
 * bare icon to guess at if art hasn't decoded yet. */
function iconButton(className: string, label: string, iconType: BuildableType): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = className
  button.setAttribute('aria-label', label)

  const url = entityIconUrl(iconType)
  if (url !== null) {
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    button.append(img)
  }

  const text = document.createElement('span')
  text.textContent = label
  button.append(text)
  return button
}

/**
 * Icon-based build navigation: two top-level categories (Buildings, Bots), each expanding into a
 * submenu of the buildable kinds currently on offer. A pure DOM-builder like BotControls.ts: the
 * caller (Toolbar) owns the actual `pending` state and turns a click into that state via
 * `onSelect`; this menu only tracks which submenu is open.
 */
export function createBuildMenu(container: HTMLElement, callbacks: BuildMenuCallbacks): BuildMenu {
  const nav = document.createElement('div')
  nav.className = 'build-nav'
  container.append(nav)

  let openCategory: BuildCategoryKey | null = null
  const categoryButtons = new Map<BuildCategoryKey, HTMLButtonElement>()
  const choiceButtons = new Map<BuildableType, HTMLButtonElement>()
  let lastPending: BuildableType | null = null

  const submenu = document.createElement('div')
  submenu.className = 'build-submenu'
  submenu.hidden = true

  const armedLabel = document.createElement('span')
  armedLabel.className = 'build-armed-label'

  function renderSubmenu(): void {
    submenu.textContent = ''
    submenu.hidden = openCategory === null
    choiceButtons.clear()
    const category = CATEGORIES.find((candidate) => candidate.key === openCategory)
    if (category === undefined) {
      return
    }
    for (const choice of category.choices) {
      const button = iconButton('build-icon', BUILD_LABELS[choice], choice)
      button.classList.toggle('armed', lastPending === choice)
      button.addEventListener('click', () => {
        callbacks.onSelect(choice)
        openCategory = null
        renderSubmenu()
      })
      choiceButtons.set(choice, button)
      submenu.append(button)
    }
  }

  for (const category of CATEGORIES) {
    const firstChoice = category.choices[0]
    if (firstChoice === undefined) {
      continue
    }
    const button = iconButton('build-icon build-category', category.label, firstChoice)
    button.addEventListener('click', () => {
      openCategory = openCategory === category.key ? null : category.key
      renderSubmenu()
    })
    categoryButtons.set(category.key, button)
    nav.append(button)
  }
  nav.append(submenu, armedLabel)
  renderSubmenu()

  return {
    render(pending): void {
      lastPending = pending
      for (const [key, button] of categoryButtons) {
        button.classList.toggle('armed', pending !== null && categoryOf(pending)?.key === key)
      }
      for (const [choice, button] of choiceButtons) {
        button.classList.toggle('armed', pending === choice)
      }
      armedLabel.textContent = pending === null ? '' : `Placing ${BUILD_LABELS[pending]} — click a tile`
    },
    destroy(): void {
      nav.remove()
    },
  }
}
