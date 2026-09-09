import { createWorld } from './sim/world'
import { createLoop } from './sim/tick'
import { textDump } from './debug/textDump'

const state = createWorld(16, 16, 1)

console.log(textDump(state))

createLoop(state, () => {
  // Rendering is added in M1.
})
