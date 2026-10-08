// The pane lab copies this into a temporary copy of the mod as tests/lab.test.ts with __LAB__ filled in, and runs it
// with `claude plugin test`. It starts a desktop session, runs the setup commands, mounts the pane at the page's size,
// replays every act the page sent (presses, typing, the map's pointer) at the time it happened on the mod's clock, and
// prints the tree the mod returns for the pane on one line after LAB-TREE. Each act in the page replays the whole list,
// so the mod's state is always the one its own hooks built.
// Not named *.test.ts here, so the mod's own `claude plugin test .` never runs it.
import { describe, mock, test } from 'claude-code/testing'

type Act =
  | { t: number; kind: 'press'; key: string }
  | { t: number; kind: 'input'; key: string; text: string }
  | { t: number; kind: 'pointer'; in: string; type: 'down' | 'move' | 'up' | 'enter' | 'leave'; x: number; y: number; button?: 'left' }
  | { t: number; kind: 'resize'; in: string; columns: number; rows: number }
  | { t: number; kind: 'command'; args: string }
  | { t: number; kind: 'size'; bodyColumns: number; bodyRows: number }
type Lab = { pane: string; title: string; setup: string[]; bodyColumns: number; bodyRows: number; acts: Act[]; at: number }
const L: Lab = __LAB__

describe('pane lab', () => {
  test('replay the page', async ($, on) => {
    mock.store(on)
    mock.env(on, { EFFORTLESS_MODEL_UI: '1' })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('classic.SessionStart', () => ({}) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('tool.call', () => ({ result: 'ok', isError: false }) as never)
    on('turn.complete', () => ({ text: '' }))
    const clock = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    for (const args of L.setup) await $.command.run({ command: 'effortless', args } as never)
    let size = { bodyColumns: L.bodyColumns, bodyRows: L.bodyRows }
    const props = () => ({ title: L.title, isFocused: true, bodyColumns: size.bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: size.bodyRows }, view: {} })
    const pane = await $.ui.mount({ plugin: 'effortless', surface: 'desktop', component: 'Pane', requestId: L.pane, props: props() } as never)
    let now = 0
    const log: string[] = []
    for (const a of L.acts) {
      if (a.t > now) {
        await clock.advance(a.t - now)
        now = a.t
      }
      try {
        if (a.kind === 'press') await pane.press({ key: a.key })
        else if (a.kind === 'input') await pane.input({ key: a.key, text: a.text })
        else if (a.kind === 'resize') await pane.resize({ in: a.in, columns: a.columns, rows: a.rows })
        else if (a.kind === 'pointer') await pane.pointer({ in: a.in, type: a.type, x: a.x, y: a.y, ...(a.button ? { button: a.button } : {}) } as never)
        else if (a.kind === 'command') await $.command.run({ command: 'effortless', args: a.args } as never)
        else if (a.kind === 'size') {
          size = { bodyColumns: a.bodyColumns, bodyRows: a.bodyRows }
          await pane.redraw(props() as never)
        }
        log.push(`ok ${a.kind}`)
      } catch (err) {
        log.push(`${a.kind} failed: ${String((err as Error)?.message ?? err).slice(0, 300)}`)
      }
    }
    if (L.at > now) await clock.advance(L.at - now)
    console.log('LAB-LOG ' + JSON.stringify(log))
    console.log('LAB-TREE ' + JSON.stringify(await pane.drawn()))
  })
})
