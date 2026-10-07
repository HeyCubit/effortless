// The render rig copies this into a temporary copy of the mod as tests/dump.test.ts, with __PARAMS__ filled in, and runs
// it with `claude plugin test`. It drives the real hooks into the asked state, mounts the desktop band above the prompt
// and prints the tree the mod returned (the same JSON the app receives) on one line after DUMP-TREE.
// Not named *.test.ts here, so the mod's own `claude plugin test .` never runs it.
import { describe, mock, test } from 'claude-code/testing'

type Params = {
  percent: number
  cacheMinutes: number | null
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  reason: string
  judged: boolean
  judging: boolean
  working: boolean
  auto: boolean
  bodyColumns: number
  options: Record<string, string>
  // Buttons pressed on the band, by key, before the dump (e.g. dash-settings opens the settings panel).
  press: string[]
  // An /effortless subcommand run before the dump (e.g. 'cold' or 'swamp' to show a test band).
  command: string
}
const P: Params = __PARAMS__

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: P.working, maxRows: 12, bodyColumns: P.bodyColumns, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const
const DESK_BAND = { plugin: 'effortless', surface: 'desktop', ...BAND } as never
const IDLE_BAND = { plugin: 'effortless', surface: 'desktop', ...BAND, props: { ...BAND.props, isWorking: false } } as never

describe('render rig', () => {
  test('dump the desktop band', { options: { layout: 'default', ...P.options } } as never, async ($, on) => {
    mock.store(on)
    mock.env(on, { EFFORTLESS_MODEL_UI: '1' })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('command.run', () => ({ text: 'ok' }))
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    const verdict = JSON.stringify({ model: 'opus', effort: P.effort, why: P.reason })
    let hold = false
    on('model.complete', () =>
      hold
        ? (new Promise(() => undefined) as never)
        : { value: { isAnswered: true as const, text: verdict, usage } },
    )
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { ...usage, cache_creation: { ephemeral_1h_input_tokens: 900, ephemeral_5m_input_tokens: 0 } },
      } as never
    })
    const clock = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: P.percent * 10_000, window: 1_000_000, percent: P.percent } } }) as never)
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)

    // The first band is the setup guide: close it, as a person does once.
    const guide = await $.ui.mount(IDLE_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()

    if (P.judged) {
      await $.prompt.submit({ text: 'fix the bug', wait: false, origin: { kind: 'composer' } } as never)
      const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: P.effort, messageCount: 1 } as never)
      for await (const _ of stream) {
        // drain
      }
    }
    if (!P.auto) {
      const band = await $.ui.mount(IDLE_BAND)
      await band.press({ key: 'dash-auto' })
      await band.unmount()
    }
    // The app redraws the band all the time, so the word's flash (a new word glows, then fades) is long over: draw it
    // once here, then wait past the flash and down to the cache time asked for (a 1 h cache started at the step).
    const before = await $.ui.mount(IDLE_BAND)
    await before.unmount()
    const settle = P.cacheMinutes === null ? 16_000 : Math.max(16_000, (60 - P.cacheMinutes) * 60_000)
    await clock.advance(settle)
    if (P.judging) {
      hold = true
      void $.prompt.submit({ text: 'and now the next one', wait: false, origin: { kind: 'composer' } } as never)
      await clock.advance(50)
    }
    if (P.command) await $.command.run({ command: 'effortless', args: P.command } as never)
    for (const key of P.press) {
      const b = await $.ui.mount(IDLE_BAND)
      await b.press({ key })
      await b.unmount()
    }
    const band = await $.ui.mount(DESK_BAND)
    console.log('DUMP-TREE ' + JSON.stringify(await band.drawn()))
  })
})
