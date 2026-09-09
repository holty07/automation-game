import { readFileSync } from 'node:fs'
import { load } from '../src/sim/serialise'
import { tick } from '../src/sim/tick'
import { textDump } from '../src/debug/textDump'

interface Args {
  fixture: string
  ticks: number
  dumpEvery: number | undefined
}

function parseArgs(argv: string[]): Args {
  let fixture: string | undefined
  let ticks: number | undefined
  let dumpEvery: number | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--fixture') {
      i += 1
      fixture = argv[i]
    } else if (arg === '--ticks') {
      i += 1
      const value = argv[i]
      ticks = value === undefined ? undefined : Number(value)
    } else if (arg === '--dump-every') {
      i += 1
      const value = argv[i]
      dumpEvery = value === undefined ? undefined : Number(value)
    }
  }

  if (fixture === undefined) {
    throw new Error('Missing required argument: --fixture <path>')
  }
  if (ticks === undefined || Number.isNaN(ticks)) {
    throw new Error('Missing required argument: --ticks <n>')
  }

  return { fixture, ticks, dumpEvery }
}

function main(): void {
  const { fixture, ticks, dumpEvery } = parseArgs(process.argv.slice(2))
  const json = readFileSync(fixture, 'utf8')
  const state = load(json)

  for (let i = 1; i <= ticks; i += 1) {
    tick(state)
    if (dumpEvery !== undefined && i % dumpEvery === 0) {
      console.log(textDump(state))
    }
  }

  console.log(textDump(state))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
