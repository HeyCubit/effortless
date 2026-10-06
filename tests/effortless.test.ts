import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { tipped, bounded, withJevKey, parseVerdict, capped, resetLabel, HANDOFF_PROMPT, handoffMessage, withAttachments, endsOnQuestion, keepsEffort, benchGrade, benchReport, judgeFailure, contextFrom, readConfig, parseChatCompletion, asSpent, cacheColor, cacheLabel, cacheSafe, cacheTtlOf, mostlyCached, isFollowUp, parseJevAnswer, parseJevKey, savedText, forkOutcome, setupNext, setupBack, setupCounter } from '../hooks/register'
import { afterPrompt, currentStep, isBigPick, phaseAtTurnEnd, progressShare, progressShows, progressTitle, soundArgv, stepNumber, stepsFromTodos, withTaskCreated, withTaskUpdated } from '../hooks/progress'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/** A TypeSafe System One reply: Jev's choice for effort and model, sure as given. */
const jevReply = (effort: string, sure = 0.9, model = 'opus') =>
  JSON.stringify({
    answers: { effort: { choice: effort, confidence: sure }, model: { choice: model, confidence: 0.8 } },
    usage: { input_tokens: 480, output_tokens: 54 },
  })

/** Haiku as the judge answers this reply, and counts how often it was asked. */
function judgeSays(on: On, text: string) {
  const asked: string[] = []
  on('model.complete', (_$, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true as const, text, usage: USAGE } }
  })
  return asked
}

/** What sits beneath the plugins in a session: the prompt goes through, the status line takes text. */
function engine(on: On, env: Record<string, string> = {}, sessionModel = 'claude-opus-5-5', said: { role: string; text: string }[] = []) {
  mock.store(on)
  mock.env(on, { EFFORTLESS_MODEL_UI: '1', ...env })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('session.messages', () => ({ value: said }) as never)
  on('session.model', () => ({ value: sessionModel }))
  on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }, { name: 'session-handoff', source: 'user' }] as never }))
}

/** Records the slash commands the mod runs, as the person's own /model and /effort. */
function recordCommands(on: On) {
  const ran: string[] = []
  on('command.run', (_$, e) => {
    ran.push(`/${e.command} ${e.args}`)
    return { text: 'ok' }
  })
  return ran
}

/** Records the model and effort each main-conversation request was sent with. */
function recordSteps(on: On) {
  const sent: { model: string; effort: unknown }[] = []
  on('turn.step', async function* (_$, e) {
    sent.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  return sent
}

/** One main-loop request, the engine sending `effort` as its own setting (high unless /effort set another). */
async function step($: Engine, effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' = 'high') {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort, messageCount: 1 })
  for await (const _ of stream) {
    // drain
  }
}

/** The desktop footer: one Auto button, and the effort in use beside it. */
const FOOTER = { plugin: 'effortless', surface: 'desktop', component: 'SessionMode', props: { modes: [] } } as never

/** The band above the prompt on desktop: it draws nothing (only the terminal has rows there). */
const DESK_BAND = { plugin: 'effortless', surface: 'desktop', ...BAND } as never

/** What a mounted tree draws, as text: its elements, props and strings. */
/** Nothing shows above the prompt on desktop: only the hidden hover cards, revealed by hovering the footer. */
async function noBand($: Engine, at: never) {
  const ui = await $.ui.mount(at)
  const text = await drawn(ui)
  expect(text).toContain('hover-cards')
  expect(text).not.toMatch(/"key":"(settings|setup|down|hot|cold|swamp)"/)
  await ui.unmount()
}

async function drawn(ui: { drawn: () => Promise<unknown> }): Promise<string> {
  return JSON.stringify(await ui.drawn())
}

/**
 * The band's buttons take clicks: the app draws anything in the flow under an absolutely placed art layer, so the
 * layer holding them must itself be absolute and come after the art.
 */
async function clickable(ui: { drawn: () => Promise<unknown> }, layer: string) {
  const find = (node: unknown): Record<string, unknown> | undefined => {
    if (!node || typeof node !== 'object') return undefined
    const n = node as Record<string, unknown>
    const props = (n.props ?? {}) as Record<string, unknown>
    if (n.key === layer || props.key === layer) return n
    for (const value of Object.values(n)) {
      const hit = Array.isArray(value) ? value.map(find).find(Boolean) : find(value)
      if (hit) return hit
    }
    return undefined
  }
  const node = find(await ui.drawn())
  expect(node).toBeDefined()
  const props = ((node as Record<string, unknown>).props ?? node) as Record<string, unknown>
  expect(props.position).toBe('absolute')
}

describe('auto', () => {
  test('effort follows the judge, the model stays the one in use', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple question"}')
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'vad heter mappen?', wait: false, origin: { kind: 'composer' } })
    await step($)

    expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'low' })
  })

  test('a reply that is not a verdict leaves the session as it is', async ($, on) => {
    engine(on)
    judgeSays(on, 'I think sonnet')
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'fixa buggen', wait: false, origin: { kind: 'composer' } })
    await step($)

    expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
  })

  test('Jev on TypeSafe decides when TYPESAFE_API_KEY is set, with typed questions, and Haiku is not asked', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' })
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"haiku","effort":"low","why":"x"}')
    const calls: { url: string; auth?: string; body: Record<string, any> }[] = []
    on('http.fetch', (_$, e) => {
      calls.push({
        url: e.url,
        auth: (e.init?.headers as Record<string, string> | undefined)?.authorization,
        body: JSON.parse(String(e.init?.body)),
      })
      return { value: { status: 200, ok: true, headers: {}, text: jevReply('max') } }
    })
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'designa om hela relayn', wait: false, origin: { kind: 'composer' } })
    await step($)

    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(calls[0].auth).toBe('Bearer k')
    expect(calls[0].body.model).toBe('jev-latest')
    expect(calls[0].body.state.next_message).toBe('designa om hela relayn')
    expect(calls[0].body.questions.effort.type).toBe('choice')
    expect(Object.keys(calls[0].body.questions.effort.criteria)).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(asked.length).toBe(0)
    expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'max' })
  })

  test('with the jev judge picked, the TypeSafe key is read from ~/.config/jev/.env when the environment has none', { options: { judge: 'jev' } } as never, async ($, on) => {
    engine(on, { USERPROFILE: 'C:/Users/x' })
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"haiku","effort":"low","why":"x"}')
    const read: string[] = []
    on('fs.read', (_$, e) => {
      read.push(e.path)
      return { value: 'OTHER=1\nTYPESAFE_API_KEY="from-file"\n' } as never
    })
    const auth: (string | undefined)[] = []
    on('http.fetch', (_$, e) => {
      auth.push((e.init?.headers as Record<string, string> | undefined)?.authorization)
      return { value: { status: 200, ok: true, headers: {}, text: jevReply('high') } }
    })
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    expect(read.map(path => path.replaceAll('\\', '/'))).toEqual(['C:/Users/x/.config/jev/.env'])
    expect(auth).toEqual(['Bearer from-file'])
    expect(asked.length).toBe(0)
  })

  test('slash commands are not judged', async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"opus","effort":"max","why":"x"}')

    await $.prompt.submit({ text: '/clear', wait: false, origin: { kind: 'composer' } })

    expect(asked.length).toBe(0)
  })
})

describe('manual effort', () => {
  test("the app's own Effort control wins over Auto and turns it off", async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"opus","effort":"high","why":"hard"}')
    const sent = recordSteps(on)
    const drain = async (index: number, effort: 'low' | 'medium' | 'high') => {
      for await (const _ of $.turn.step({ turnId: 't1', index, model: 'claude-opus-5-5', effort, messageCount: 1 })) {
        // drain
      }
    }

    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    await drain(0, 'medium')
    expect(sent[0].effort).toBe('high')

    // The person picks Low in the app between two requests.
    await drain(1, 'low')
    expect(sent[1].effort).toBe('low')
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'auto' }))?.text).toContain('Auto off')
    await ui.unmount()

    await drain(2, 'low')
    expect(sent[2].effort).toBe('low')
  })
})

describe('model in use', () => {
  test('a switch in the app moves the band, and effort applies to the new model at once', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"kort"}')
    const sent = recordSteps(on)
    mock.clock(on)
    on('classic.PostModelSwitch', () => ({}) as never)
    const switchTo = (from: string, to: string) =>
      $.classic.PostModelSwitch({ from_model: from, to_model: to, requested_model: null, source: 'picker', context_tokens: 0 } as never)

    await switchTo('claude-opus-5-5', 'claude-haiku-4-5-20251001')
    await $.prompt.submit({ text: 'ok', wait: false, origin: { kind: 'composer' } })
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    await ui.redraw()
    expect((await ui.find({ key: 'm-haiku' }))?.text).toContain('Haiku')

    // The person picks Opus in the app.
    await switchTo('claude-haiku-4-5-20251001', 'claude-opus-5-5')
    await ui.redraw()
    expect((await ui.find({ key: 'm-opus' }))?.text).toContain('Opus')

    await step($, 'medium')
    expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'low' })
    await ui.unmount()
  })
})

describe('two autos', () => {
  test('Auto for model starts off: effort follows the judge and no model is suggested', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const sent = recordSteps(on)
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'auto' }))?.text).toContain('Auto on')
    expect((await ui.find({ key: 'auto-model' }))?.text).toContain('Auto off')

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await ui.redraw()
    expect(await ui.find({ key: 'accept' })).toBeUndefined()

    await step($, 'medium')
    expect(sent[0].effort).toBe('low')
    expect(ran).toEqual([])
    await ui.unmount()
  })

  test('Auto for effort off: the judge may still suggest a model, effort is left alone', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const mocked = mock.clock(on)
    on('turn.complete', () => ({ text: '' }))
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto' })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await ui.redraw()
    expect(await ui.find({ key: 'accept' })).toBeDefined()

    await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'completed' } as never)
    await mocked.advance(10)
    expect(ran).toEqual([])
    await ui.unmount()
  })
})

describe('typed commands', () => {
  const box = (on: On, draft: string) => {
    const filled: string[] = []
    on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }) as never)
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    return filled
  }

  test('a model click types /model into an empty box for you to send', async ($, on) => {
    engine(on)
    const filled = box(on, '')
    const ran = recordCommands(on)
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })

    await ui.press({ key: 'm-haiku' })

    expect(filled).toEqual(['/model haiku'])
    expect(ran).toEqual([])
    await ui.unmount()
  })

  test('with a draft in the box nothing is overwritten and the mod runs the model switch itself', async ($, on) => {
    engine(on)
    const filled = box(on, 'ett halvskrivet meddelande')
    const ran = recordCommands(on)
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })

    await ui.press({ key: 'm-haiku' })

    expect(filled).toEqual([])
    expect(ran).toEqual(['/model haiku'])
    await ui.unmount()
  })

  test('an effort click sets the effort at once and also types /effort for the app', async ($, on) => {
    engine(on)
    const filled = box(on, '')
    const sent = recordSteps(on)
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })

    await ui.press({ key: 'e-high' })
    await step($, 'medium')

    expect(filled).toEqual(['/effort high'])
    expect(sent[0].effort).toBe('high')
    await ui.unmount()
  })
})

describe('footer text', () => {
  const PURPLE = '#a79cf7'
  const auto = async ($: Engine) => String((await $.command.run({ command: 'effortless', args: 'auto' })).text)
  const saving = (on: On, outputTokens: number) =>
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { ...USAGE, output_tokens: outputTokens, model: 'claude-opus-5-5' },
      } as never
    })
  const asked = async ($: Engine) => String((await $.command.run({ command: 'effortless', args: 'stats' })).text)

  test('the footer is purple text and one small button; no box, nothing lit', async ($, on) => {
    engine(on)
    const footer = await $.ui.mount(FOOTER)
    const text = await drawn(footer)
    expect(text).toContain(`"color":"${PURPLE}"`)
    expect(text).toContain('"children":[" Auto "]')
    // The only button is the small switch for Auto: no label other than the power glyph, not the lit look.
    // The Auto switch, the setup (or settings gear) and the handoff symbol.
    expect(text.match(/"type":"Button"/g)?.length).toBe(3)
    expect(text).toContain('"label":" ⏻ "')
    // No frame of its own (it drew wide and cut off): plain, with the same grey box as the level on hover.
    expect(text).toContain('"plain":true')
    expect(text).toContain('"hover":{"scope":"power","backgroundColor":"#2b2b2f"}')
    expect(text).not.toContain('"variant":"primary"')
    expect(text).not.toContain('borderStyle')
    // Hovering the level puts a grey box behind it.
    expect(text).toContain('"hover":{"scope":"effort","backgroundColor":"#2b2b2f"}')
    // No background at rest: the only ones are in the hover styles and the hidden hover cards (display none).
    expect(text.replaceAll('"backgroundColor":"#2b2b2f"}', '').replaceAll('"backgroundColor":"#221c3a"', '')).not.toContain('backgroundColor')
    await footer.unmount()
  })

  test('with Auto on it is the effort in use, in purple', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"high","why":"hard"}')
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    const text = await drawn(footer)
    expect(text).toContain('"children":[" High "]')
    expect(text).toContain(`"color":"${PURPLE}"`)
    await footer.unmount()
  })

  test('the small button switches Auto off ("Off", dim, not purple) and on again', async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"high","why":"hard"}')
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).toContain('"children":[" High "]')

    await footer.press({ key: 'auto' })
    const off = await drawn(footer)
    expect(off).toContain('"children":[" Off "]')
    expect(off).not.toContain(`"color":"${PURPLE}"`)
    await $.prompt.submit({ text: 'en till', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(1)

    await footer.press({ key: 'auto' })
    expect(await drawn(footer)).toContain(`"color":"${PURPLE}"`)

    // The command does the same.
    expect(await auto($)).toContain('Auto off')
    expect(await drawn(footer)).toContain('"children":[" Off "]')
    await footer.unmount()
  })

  test("the app's own Effort control turns Auto off and the footer says Off", async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"high","why":"hard"}')
    recordSteps(on)
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(await drawn(footer)).toContain(`"color":"${PURPLE}"`)

    // The person picks another effort in the app between two requests.
    await step($, 'low')
    expect(await drawn(footer)).toContain('"children":[" Off "]')
    await footer.unmount()
  })

  test('on Haiku there is no effort to name', async ($, on) => {
    engine(on, {}, 'claude-haiku-4-5-20251001')
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    mock.clock(on)
    on('classic.PostModelSwitch', () => ({}) as never)
    const footer = await $.ui.mount(FOOTER)
    await $.classic.PostModelSwitch({
      from_model: 'claude-opus-5-5',
      to_model: 'claude-haiku-4-5-20251001',
      requested_model: 'haiku',
      source: 'picker',
      context_tokens: 0,
    } as never)
    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).not.toContain('Low')
    await footer.unmount()
  })

  test('the judge is told that scope counts: a short message can be a big job', async ($, on) => {
    engine(on)
    let system = ''
    on('model.complete', (_$, e) => {
      system = String(e.system)
      return { value: { isAnswered: true as const, text: '{"model":"opus","effort":"high","why":"stor uppgift"}', usage: USAGE } } as never
    })
    await $.prompt.submit({ text: 'go through my whole google drive and clean it up', wait: false, origin: { kind: 'composer' } })
    expect(system).toContain('SCOPE')
    expect(system).toContain('whole drive')
    expect(system).toContain('never low')
  })

  test('a thinking state while the judge decides', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    // The judge takes half a second to answer.
    on('model.complete', async () => {
      await mocked.sleep(500)
      return { value: { isAnswered: true as const, text: '{"model":"sonnet","effort":"high","why":"x"}', usage: USAGE } } as never
    })
    const footer = await $.ui.mount(FOOTER)
    expect(await drawn(footer)).not.toContain('Deciding')

    const submitted = $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(100)
    expect(await drawn(footer)).toContain('"children":[" Deciding… "]')

    await mocked.advance(600)
    await submitted
    expect(await drawn(footer)).not.toContain('Deciding')
    expect(await drawn(footer)).toContain('"children":[" High "]')
    await footer.unmount()
  })

  test('a switch is shown as Low → High for a moment, then only the level', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    let verdict = '{"model":"sonnet","effort":"low","why":"simple"}'
    on('model.complete', () => ({ value: { isAnswered: true as const, text: verdict, usage: USAGE } }) as never)
    const footer = await $.ui.mount(FOOTER)

    // The first verdict has nothing to switch from.
    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).not.toContain('→')

    verdict = '{"model":"sonnet","effort":"high","why":"hard"}'
    await $.prompt.submit({ text: 'hard task across several files', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).toContain('"children":[" Low → High "]')

    await mocked.advance(2600)
    const settled = await drawn(footer)
    expect(settled).not.toContain('→')
    expect(settled).toContain('"children":[" High "]')
    await footer.unmount()
  })

  test('/effortless stats reports the measured cost of every token kind, per effort, and the judge', async ($, on) => {
    engine(on)
    mock.clock(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 600, cache_read_input_tokens: 10000, cache_creation_input_tokens: 800, model: 'claude-opus-5-5' },
      } as never
    })
    expect(await asked($)).toContain('nothing measured yet')

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await step($, 'high')

    // 100 in + 800 written x1.25 + 10000 read x0.1 + 600 out x5 = 100 + 1000 + 1000 + 3000 = 5100.
    const text = await asked($)
    expect(text).toContain('1 prompts, 1 requests, cost about 5.1k')
    expect(text).toContain('cache reads 20 %, cache writes 20 %, output 59 %')
    expect(text).toContain('Low 1, average 5.1k')
    expect(text).toContain('Judge: Jev 0, Haiku 1, custom 0')
    expect(text).not.toContain('saved about')
  })

  test('requests you steered yourself are not counted', async ($, on) => {
    engine(on)
    saving(on, 600)
    const rows = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    await rows.press({ key: 'e-low' })
    await step($, 'high')
    expect(await asked($)).toContain('nothing measured yet')
    await rows.unmount()
  })

  test('nothing is drawn above the prompt on desktop', async ($, on) => {
    engine(on)
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
  })

  test('a model suggestion still asks above the prompt on desktop', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    mock.clock(on)
    const rows = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    await rows.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    const ask = await $.ui.mount(DESK_BAND)
    expect(await ask.find({ key: 'accept' })).toBeDefined()
    await ask.unmount()
    await rows.unmount()
  })

  test('the model row is paused: effort only, unless EFFORTLESS_MODEL_UI=1', async ($, on) => {
    engine(on, { EFFORTLESS_MODEL_UI: '0' })
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'e-high' })).toBeDefined()
    expect(await ui.find({ key: 'm-opus' })).toBeUndefined()
    expect(await ui.find({ key: 'auto-model' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('helpers', () => {
  test('cacheSafe: effort may change on Opus 5.5 and Sonnet 5.5 only', () => {
    expect(cacheSafe('claude-opus-5-5')).toBe(true)
    expect(cacheSafe('claude-sonnet-5-5[1m]')).toBe(true)
    expect(cacheSafe('claude-fable-5-1')).toBe(false)
    expect(cacheSafe('claude-opus-4-8')).toBe(false)
    expect(cacheSafe('claude-opus-5')).toBe(false)
  })

  test('parseJevKey reads the key line, quoted or not, and nothing else', () => {
    expect(parseJevKey('TYPESAFE_API_KEY=abc')).toBe('abc')
    expect(parseJevKey('X=1\n  TYPESAFE_API_KEY = "q w" \n')).toBe('q w')
    expect(parseJevKey('TYPESAFE_API_KEY=')).toBeUndefined()
    expect(parseJevKey('OTHER=1')).toBeUndefined()
  })

  test('parseJevAnswer: a sure answer wins, an unsure one keeps the current effort, junk is nothing', () => {
    const current = { model: 'opus' as const, effort: 'high' as const, why: '', by: 'manual' as const }
    expect(parseJevAnswer(jevReply('low', 0.9), current)?.effort).toBe('low')
    expect(parseJevAnswer(jevReply('low', 0.4), current)?.effort).toBe('high')
    expect(parseJevAnswer(jevReply('low', 0.4), null)?.effort).toBe('low')
    expect(parseJevAnswer(jevReply('turbo'), current)).toBeUndefined()
    expect(parseJevAnswer('nope', current)).toBeUndefined()
  })
})

describe('follow-ups', () => {
  test('isFollowUp: short go-aheads yes, real requests no', () => {
    for (const t of ['go', 'ok', ' yes ', 'ok go', 'continue']) expect(isFollowUp(t)).toBe(true)
    for (const t of ['', 'rename x to count in utils', 'go through my whole drive']) expect(isFollowUp(t)).toBe(false)
  })

  test('"go" after a judged prompt keeps its effort and asks no judge', async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"opus","effort":"high","why":"hard"}')
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'granska hela relayn', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(asked.length).toBe(1)
    expect(sent[0].effort).toBe('high')
  })
})

describe('state from an older version', () => {
  test('the pre-0.2.0 tally { requests, actual, baseline } reads as an empty tally, never throws', () => {
    const old = { requests: 3, actual: 900, baseline: 1500 } as never
    expect(asSpent(old).judge).toEqual({ jev: 0, haiku: 0, custom: 0, ms: 0, tokens: 0 })
    expect(asSpent(old).byEffort).toEqual({})
    expect(() => savedText(old)).not.toThrow()
    expect(asSpent(undefined).prompts).toBe(0)
  })
})

describe('cache countdown', () => {
  const answer = (on: On, cacheCreation?: Record<string, number>) =>
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { ...USAGE, ...(cacheCreation ? { cache_creation: cacheCreation } : {}) },
      } as never
    })
  // The countdown's timer starts with the session, as in the app.
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }
  const shows = (text: string) => `"children":["${text}"]`

  test('cacheTtlOf and cacheLabel', () => {
    expect(cacheTtlOf({ cache_creation: { ephemeral_1h_input_tokens: 900, ephemeral_5m_input_tokens: 0 } })).toBe('1h')
    expect(cacheTtlOf({ cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 10 } })).toBe('5m')
    expect(cacheTtlOf({ input_tokens: 1 })).toBeUndefined()
    expect(cacheLabel(60)).toBe('59m')
    expect(cacheLabel(1)).toBe('<1m')
    expect(cacheLabel(0)).toBe('❄ Cold')
    expect(cacheColor(60)).toBeUndefined()
    expect(cacheColor(22)).toBeUndefined()
    expect(cacheColor(21)).toBe('#e0a33a')
    expect(cacheColor(7)).toBe('#e0a33a')
    expect(cacheColor(6)).toBe('#e5534b')
    expect(cacheColor(1)).toBe('#e5534b')
    expect(cacheColor(0)).toBe('#7cc4ff')
    expect(mostlyCached({ input_tokens: 90000, cache_read_input_tokens: 10 })).toBe(false)
  })

  test('nothing before the first response; then it counts down with no further response, turns amber, goes cold', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_1h_input_tokens: 500, ephemeral_5m_input_tokens: 0 })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    expect(await drawn(footer)).not.toContain('Cold')

    await step($)
    expect(await drawn(footer)).toContain(shows('59m'))

    // No request in between: the session's own timer moves it.
    await mocked.advance(30 * 60_000)
    expect(await drawn(footer)).toContain(shows('29m'))

    expect(await drawn(footer)).not.toContain('"color":"#e')
    await mocked.advance(10 * 60_000)
    expect(await drawn(footer)).toContain(shows('19m'))
    expect(await drawn(footer)).toContain('"color":"#e0a33a"')
    await mocked.advance(16 * 60_000)
    const late = await drawn(footer)
    expect(late).toContain(shows('3m'))
    expect(late).toContain('"color":"#e5534b"')

    await mocked.advance(5 * 60_000)
    expect(await drawn(footer)).toContain(shows('❄ Cold'))

    await step($)
    expect(await drawn(footer)).toContain(shows('59m'))
    await footer.unmount()
  })

  test('a response that does not say its lifetime is counted as 1 hour', async ($, on) => {
    engine(on)
    mock.clock(on)
    answer(on)
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    await step($)
    expect(await drawn(footer)).toContain(shows('59m'))
    await footer.unmount()
  })

  test('a response that says 5 minutes counts down 5 minutes', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_5m_input_tokens: 500 })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    await step($)
    expect(await drawn(footer)).toContain(shows('4m'))
    await mocked.advance(6 * 60_000)
    expect(await drawn(footer)).toContain(shows('❄ Cold'))
    await footer.unmount()
  })

  /** The band above the prompt, with the first-run setup guide closed so the cold band can show. */
  const coldBand = async ($: Engine) => {
    const band = await $.ui.mount(DESK_BAND)
    if (await band.find({ key: 'setup-haiku' })) {
      await band.press({ key: 'setup-haiku' })
      await band.press({ key: 'setup-close' })
    }
    return band
  }

  test('Compact appears only once the cache is cold, and a click compacts', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_1h_input_tokens: 500, ephemeral_5m_input_tokens: 0 })
    let compacted = 0
    on('command.run', (_$, e) => {
      if (e.command === 'compact') compacted++
      return { text: 'ok' }
    })
    await start($, on)
    await step($)
    await mocked.advance(59 * 60_000)
    // Still warm: no band (only the first-run guide, closed here), so nothing to compact yet.
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-haiku' })
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    await mocked.advance(2 * 60_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'cold-compact' })).toBeDefined()
    await band.press({ key: 'cold-compact' })
    await mocked.advance(100)
    // The test kit's compaction has no transcript to run over, so only the call is checked here.
    expect(compacted).toBe(1)
    await band.unmount()
  })

  test('/effortless cold shows Cold and the Compact button at once, for testing', async ($, on) => {
    engine(on)
    mock.clock(on)
    answer(on, { ephemeral_1h_input_tokens: 500 })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    await step($)
    const reply = await $.command.run({ command: 'effortless', args: 'cold' })
    expect(String(reply.text)).toContain('cold')
    expect(await drawn(footer)).toContain(shows('❄ Cold'))
    expect(await footer.find({ key: 'compact' })).toBeUndefined()
    const band = await coldBand($)
    expect(await band.find({ key: 'cold-compact' })).toBeDefined()
    await band.unmount()
    await footer.unmount()
  })

  test('a compact that fails says why in a toast, nothing breaks', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_5m_input_tokens: 500 })
    on('command.run', (_$, e) => {
      if (e.command === 'compact') throw new Error('compact is not available here')
      return { text: 'ok' }
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    const band = await coldBand($)
    await step($)
    await mocked.advance(6 * 60_000)
    await band.press({ key: 'cold-compact' })
    expect(toasts.join(' ')).toContain('compact failed')
    expect(await drawn(footer)).toContain(shows('❄ Cold'))
    await band.unmount()
    await footer.unmount()
  })
})

describe('cache guard', () => {
  test('on Fable Auto neither judges nor changes the effort, and the footer says Paused', async ($, on) => {
    engine(on, {}, 'claude-fable-5-1')
    const asked = judgeSays(on, '{"model":"opus","effort":"low","why":"x"}')
    const sent: unknown[] = []
    on('turn.step', async function* (_$, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', effort: 'xhigh', messageCount: 1 })
    for await (const _ of stream) {
      // drain
    }
    expect(asked.length).toBe(0)
    expect(sent).toEqual(['xhigh'])
    expect(await drawn(footer)).toContain('"children":[" Paused "]')
    await footer.unmount()
  })

  test('a pick made on Opus 5.5 is not applied to a Fable request', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"opus","effort":"low","why":"x"}')
    const sent: unknown[] = []
    on('turn.step', async function* (_$, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    for (const model of ['claude-opus-5-5', 'claude-fable-5-1']) {
      const stream = $.turn.step({ turnId: 't1', index: 0, model, effort: 'xhigh', messageCount: 1 })
      for await (const _ of stream) {
        // drain
      }
    }
    expect(sent).toEqual(['low', 'xhigh'])
  })
})

describe('footer', () => {
  test('auto sets the effort of the request, never runs /effort or /model', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'rename the function', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')

    expect(sent[0].effort).toBe('low')
    expect(ran).toEqual([])
  })

  test('a different model is only suggested, and /effortless switch switches it', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const mocked = mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(10)
    expect(ran.some(c => c.startsWith('/model'))).toBe(false)
    await ui.redraw()
    expect(await ui.find({ key: 'accept' })).toBeDefined()

    await ui.press({ key: 'accept' })
    expect(ran).toContain('/model haiku')
    await ui.unmount()
  })

  test('Keep turns the suggestion down and it does not come back', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    recordCommands(on)
    const mocked = mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(10)
    await ui.redraw()
    await ui.press({ key: 'decline' })
    await $.prompt.submit({ text: 'hej igen', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(10)
    await ui.redraw()

    expect(await ui.find({ key: 'accept' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('band', () => {
  for (const surface of ['terminal'] as const) {
    test(`clicking an effort turns auto off and is what the turn runs with (${surface})`, async ($, on) => {
      engine(on)
      const asked = judgeSays(on, '{"model":"haiku","effort":"low","why":"x"}')
      const sent = recordSteps(on)
      const ran = recordCommands(on)

      const ui = await $.ui.mount({ plugin: 'effortless', surface, ...BAND })
      expect((await ui.find({ key: 'auto' }))?.text).toContain('Auto on')

      await ui.press({ key: 'e-xhigh' })
      expect((await ui.find({ key: 'auto' }))?.text).toContain('Auto off')
      expect(ran).toEqual([])

      await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
      await step($, 'xhigh')

      expect(asked.length).toBe(0)
      expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })

      await ui.press({ key: 'auto' })
      expect((await ui.find({ key: 'auto' }))?.text).toContain('Auto on')
      await ui.unmount()
    })
  }
})

describe('review fixes', () => {
  test('a Jev endpoint that never answers holds the prompt only for the timeout, then Haiku judges', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' })
    const mocked = mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    on('http.fetch', () => new Promise(() => undefined) as never)
    const sent = recordSteps(on)

    const submitted = $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(3500)
    await submitted
    await step($, 'high')

    expect(asked.length).toBe(1)
    expect(sent[0].effort).toBe('low')
  })

  test('Jev answering with an error status falls through to Haiku', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' })
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    on('http.fetch', () => ({ value: { status: 500, ok: false, headers: {}, text: 'boom' } }))

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(1)
  })

  test('a model switch that changes the engine effort is not read as you choosing, Auto stays on', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    mock.clock(on)
    on('classic.PostModelSwitch', () => ({}) as never)
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await step($, 'xhigh')
    expect(sent[0].effort).toBe('low')

    // The person picks another model; the engine's own effort for it is different.
    await $.classic.PostModelSwitch({
      from_model: 'claude-opus-5-5',
      to_model: 'claude-sonnet-5-5',
      requested_model: 'sonnet',
      source: 'picker',
      context_tokens: 0,
    } as never)
    await step($, 'medium')

    // Auto still decides: the request keeps the judged effort instead of the engine's 'medium'.
    expect(sent[1].effort).toBe('low')
  })

  test('/effortless switch switches to the suggested model and /effortless keep turns it down', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const mocked = mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    const result = await $.command.run({ command: 'effortless', args: 'switch' })
    await mocked.advance(10)
    expect(String(result.text)).toContain('haiku')
    expect(ran).toContain('/model haiku')

    await $.prompt.submit({ text: 'a new question about something else', wait: false, origin: { kind: 'composer' } })
    const kept = await $.command.run({ command: 'effortless', args: 'keep' })
    expect(String(kept.text)).toContain('Keeping')
    await ui.unmount()
  })
})

describe('judge choice (plugin settings)', () => {
  const chat = (content: string) =>
    JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 300, completion_tokens: 20 } })

  test('readConfig: an unknown or empty judge is auto, values are trimmed', () => {
    expect(readConfig(undefined).judge).toBe('auto')
    expect(readConfig({ judge: 'gpt' }).judge).toBe('auto')
    expect(readConfig({ judge: 'custom', customUrl: ' http://x/v1/chat/completions ' })).toEqual({
      judge: 'custom',
      typesafeKey: '',
      customUrl: 'http://x/v1/chat/completions',
      customModel: '',
      customKey: '',
      handoffSkill: '',
      handoffAfter: 'continue',
      bias: 0,
      floor: 'low',
      ceiling: 'max',
      hide: [],
      swampAt: 50,
    })
    expect(readConfig({ swampAt: '20' })).toMatchObject({ swampAt: 20 })
    expect(readConfig({ swampAt: '33' }).swampAt).toBe(50)
    expect(readConfig({ handoffSkill: '/session-handoff', handoffAfter: 'confirm' })).toMatchObject({
      handoffSkill: 'session-handoff',
      handoffAfter: 'confirm',
    })
    expect(parseChatCompletion(chat('{"model":"opus","effort":"high","why":"x"}'))?.effort).toBe('high')
    expect(parseChatCompletion('nope')).toBeUndefined()
  })

  test('custom: the OpenAI-compatible endpoint decides, with its model and key, and Haiku is not asked', { options: { judge: 'custom', customUrl: 'http://localhost:11434/v1/chat/completions', customModel: 'llama3.2', customKey: 'sk-test' } } as never, async ($, on) => {
    engine(on)
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"haiku","effort":"low","why":"x"}')
    const calls: { url: string; auth?: string; body: Record<string, any> }[] = []
    on('http.fetch', (_$, e) => {
      calls.push({ url: e.url, auth: (e.init?.headers as Record<string, string> | undefined)?.authorization, body: JSON.parse(String(e.init?.body)) })
      return { value: { status: 200, ok: true, headers: {}, text: chat('{"model":"opus","effort":"xhigh","why":"big"}') } }
    })
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'refactor the whole relay', wait: false, origin: { kind: 'composer' } })
    await step($)
    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe('http://localhost:11434/v1/chat/completions')
    expect(calls[0].auth).toBe('Bearer sk-test')
    expect(calls[0].body.model).toBe('llama3.2')
    expect(calls[0].body.messages[0].role).toBe('system')
    expect(asked.length).toBe(0)
    expect(sent[0].effort).toBe('xhigh')
  })

  test('custom endpoint failing falls back to Haiku', { options: { judge: 'custom', customUrl: 'http://localhost:1/v1/chat/completions' } } as never, async ($, on) => {
    engine(on)
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    on('http.fetch', () => ({ value: { status: 500, ok: false, headers: {}, text: 'down' } }))
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'hello there', wait: false, origin: { kind: 'composer' } })
    await step($)
    expect(asked.length).toBe(1)
    expect(sent[0].effort).toBe('low')
  })

  test('haiku: a TypeSafe key in the environment is not used', { options: { judge: 'haiku' } } as never, async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' })
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    let fetched = 0
    on('http.fetch', () => {
      fetched++
      return { value: { status: 500, ok: false, headers: {}, text: '' } }
    })
    await $.prompt.submit({ text: 'hello there', wait: false, origin: { kind: 'composer' } })
    expect(fetched).toBe(0)
    expect(asked.length).toBe(1)
  })

  test('jev: the key from the settings is used before the environment', { options: { judge: 'jev', typesafeKey: 'from-settings' } } as never, async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'from-env' })
    mock.clock(on)
    const auth: (string | undefined)[] = []
    on('http.fetch', (_$, e) => {
      auth.push((e.init?.headers as Record<string, string> | undefined)?.authorization)
      return { value: { status: 200, ok: true, headers: {}, text: jevReply('high') } }
    })
    await $.prompt.submit({ text: 'hard task here', wait: false, origin: { kind: 'composer' } })
    expect(auth).toEqual(['Bearer from-settings'])
  })
})

describe('context for the judge', () => {
  test("the assistant's last reply goes along, long and from its end, where its question sits", () => {
    const question = 'Which section should I build: A (simple), B (a complicated multi-step layout) or C?'
    const reply = 'x'.repeat(5000) + ' ' + question
    const text = contextFrom([
      { role: 'user', text: 'make me a new section' },
      { role: 'assistant', text: reply },
    ])
    expect(text).toContain(question)
    expect(text).toContain('user: make me a new section')
    expect(text.length).toBeLessThan(2500)
    expect(contextFrom([])).toBe('')
  })

  test("Haiku is handed the assistant's question and told how to judge an answer to it", async ($, on) => {
    mock.store(on)
    mock.env(on, {})
    mock.clock(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('ui.status', () => ({ value: undefined }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.messages', () => ({
      value: [
        { role: 'user', text: 'make me a new section' },
        { role: 'assistant', text: 'Which one: A (simple) or B (a complicated multi-step layout)?' },
      ],
    }) as never)
    const seen: { system?: string; prompt: string }[] = []
    on('model.complete', (_$, e) => {
      seen.push({ system: e.system, prompt: e.prompt })
      return { value: { isAnswered: true as const, text: '{"model":"opus","effort":"high","why":"B is big"}', usage: USAGE } }
    })
    await $.prompt.submit({ text: 'B', wait: false, origin: { kind: 'composer' } })
    expect(seen[0].prompt).toContain('B (a complicated multi-step layout)')
    expect(seen[0].system).toContain('judge only the work that answer starts')
    expect(seen[0].system).toContain('should I archive this?')
  })
})

describe('model-aware effort', () => {
  test('the judge is told which model runs and that effort is relative to it', async ($, on) => {
    engine(on, {}, 'claude-sonnet-5-5')
    mock.clock(on)
    const seen: { system?: string; prompt: string }[] = []
    on('model.complete', (_$, e) => {
      seen.push({ system: e.system, prompt: e.prompt })
      return { value: { isAnswered: true as const, text: '{"model":"sonnet","effort":"high","why":"x"}', usage: USAGE } }
    })
    await $.prompt.submit({ text: 'refactor the parser', wait: false, origin: { kind: 'composer' } })
    expect(seen[0].prompt).toContain('Current: sonnet')
    expect(seen[0].system).toContain('Opus at medium does about what Sonnet does at high')
  })

  test('Jev gets the model in use and the same rule', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' }, 'claude-opus-5-5')
    mock.clock(on)
    const bodies: Record<string, any>[] = []
    on('http.fetch', (_$, e) => {
      bodies.push(JSON.parse(String(e.init?.body)))
      return { value: { status: 200, ok: true, headers: {}, text: jevReply('medium') } }
    })
    await $.prompt.submit({ text: 'refactor the parser', wait: false, origin: { kind: 'composer' } })
    expect(bodies[0].state.current_model).toBe('opus')
    expect(bodies[0].state.task).toContain('Opus at medium does about what')
  })
})

describe('keys', () => {
  test('auto never opens ~/.config/jev/.env: it judges with Haiku', async ($, on) => {
    engine(on, { USERPROFILE: 'C:/Users/x' })
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    const read: string[] = []
    on('fs.read', (_$, e) => {
      read.push(e.path)
      return { value: 'TYPESAFE_API_KEY=secret' } as never
    })
    await $.prompt.submit({ text: 'hello there', wait: false, origin: { kind: 'composer' } })
    expect(read.filter(path => path.includes('.env'))).toEqual([])
    expect(asked.length).toBe(1)
  })
})

describe('setup guide', () => {
  const DESK = { plugin: 'effortless', surface: 'desktop', ...BAND } as never
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }
  const settings = (on: On) => {
    const set: { key: string; value: unknown }[] = []
    on('config.set', (_$, e) => {
      set.push({ key: e.key, value: e.value })
      return { value: e.value } as never
    })
    return set
  }
  const toasts = (on: On) => {
    const said: string[] = []
    on('ui.toast', (_$, e) => {
      said.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    return said
  }

  test('the steps run judge, lean, handoff, footer, done; Back goes one step back', () => {
    expect(setupNext('pick')).toBe('lean')
    expect(setupNext('jev')).toBe('lean')
    expect(setupNext('custom')).toBe('lean')
    expect(setupNext('lean')).toBe('handoff')
    expect(setupNext('handoff')).toBe('footer')
    expect(setupNext('footer')).toBe('done')
    expect(setupNext('done')).toBeNull()
    expect(setupBack('pick')).toBeNull()
    expect(setupBack('jev')).toBe('pick')
    expect(setupBack('lean')).toBe('pick')
    expect(setupBack('done')).toBe('footer')
    expect(setupCounter('jev')).toBe('1/4')
    expect(setupCounter('footer')).toBe('4/4')
    expect(setupCounter('done')).toBe('')
  })

  test('opens by itself the first time; the choices are saved together at Done, which closes it for good', async ($, on) => {
    engine(on)
    mock.clock(on)
    const set = settings(on)
    const said = toasts(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    expect(await band.find({ key: 'setup-haiku' })).toBeDefined()
    expect(await band.find({ key: 'setup-custom' })).toBeDefined()
    expect(await band.find({ key: 'setup-back' })).toBeUndefined()
    await clickable(band, 'setup-actions')
    // Branded: the name in the footer's purple, the step counter beside it.
    expect(await drawn(band)).toContain('"color":"#a79cf7"')
    expect(await drawn(band)).toContain('✦ effortless setup  1/4')
    expect(await drawn(band)).toContain('Jev (API)')
    // The right side: a still SVG (every click redraws the band, and a redrawn animation flickers) with the gradient.
    const first = await drawn(band)
    expect(first).toContain('"type":"Svg"')
    expect(first).not.toContain('"isInteractive":true')
    expect(first).toContain('linearGradient')
    await band.press({ key: 'setup-haiku' })
    // Nothing is saved yet: each saved setting reloads the plugin and puts a notice in the chat.
    expect(set).toEqual([])
    expect(said.join(' ')).toContain('Haiku judges')

    // 2/4 the lean: each stop is named and says what it does; the track lights toward the marker.
    expect(await drawn(band)).toContain('2/4')
    expect(await drawn(band)).toContain('Balanced: ')
    await band.press({ key: 'setup-bias4' })
    expect(await drawn(band)).toContain('Smartest: ')
    expect(await drawn(band)).toContain('{"color":"#a79cf7"},"children":["──"]')
    await band.press({ key: 'setup-next' })

    // 3/4 the handoff: the installed skills to pick from.
    expect(await drawn(band)).toContain('3/4')
    expect(await drawn(band)).toContain('/session-handoff')
    await band.select({ key: 'setup-skill', value: 'session-handoff' })
    await band.press({ key: 'setup-next' })

    // 4/4 the footer: the cache timer and the handoff button, both ticked; a click unticks one.
    expect(await drawn(band)).toContain('4/4')
    expect(await drawn(band)).toContain('{"key":"setup-box-handoff","label":"✔︎","variant":"primary"}')
    expect(await band.find({ key: 'setup-show-cold' })).toBeUndefined()
    await band.press({ key: 'setup-box-timer' })
    expect(await drawn(band)).toContain('{"key":"setup-box-timer","label":"✔︎","dimColor":true,"variant":"secondary"}')
    await band.press({ key: 'setup-next' })

    // The last word: the footer's buttons and Fable. Back goes to the footer step.
    expect(await drawn(band)).toContain('Auto pauses on Fable')
    await band.press({ key: 'setup-back' })
    expect(await drawn(band)).toContain('4/4')
    await band.press({ key: 'setup-next' })
    expect(set).toEqual([])
    await band.press({ key: 'setup-done' })
    expect(set).toEqual([
      { key: 'effortless.hide', value: 'timer' },
      { key: 'effortless.judge', value: 'haiku' },
      { key: 'effortless.effortBias', value: '2' },
      { key: 'effortless.handoffSkill', value: 'session-handoff' },
    ])
    await band.unmount()
    await expect($.ui.mount(DESK)).rejects.toThrow()

    // A new session: the guide stays closed; /effortless setup opens it again.
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await expect($.ui.mount(DESK)).rejects.toThrow()
    await $.command.run({ command: 'effortless', args: 'setup' })
    const again = await $.ui.mount(DESK)
    expect(await again.find({ key: 'setup-jev' })).toBeDefined()
    await again.unmount()
  })

  test('Jev without a key asks for it in the band; Skip goes on to the lean, Back returns to the pick', async ($, on) => {
    engine(on)
    mock.clock(on)
    const set = settings(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    await band.press({ key: 'setup-jev' })
    expect(set).toEqual([])
    expect(await drawn(band)).toContain('typesafe.ai')
    expect(await drawn(band)).toContain('typesafe.ai')
    expect(await band.find({ key: 'setup-key' })).toBeDefined()
    expect(await band.find({ key: 'setup-haiku' })).toBeUndefined()
    await band.press({ key: 'setup-skip' })
    expect(await band.find({ key: 'setup-bias2' })).toBeDefined()
    await band.press({ key: 'setup-back' })
    expect(await band.find({ key: 'setup-jev' })).toBeDefined()
    // The cross keeps what was picked so far.
    await band.press({ key: 'setup-close' })
    expect(set).toEqual([{ key: 'effortless.judge', value: 'jev' }])
    await band.unmount()
  })

  test('Custom asks for the URL and the model in the band', async ($, on) => {
    engine(on)
    mock.clock(on)
    const set = settings(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    await band.press({ key: 'setup-custom' })
    expect(set).toEqual([])
    expect(await band.find({ key: 'setup-url' })).toBeDefined()
    expect(await band.find({ key: 'setup-model' })).toBeDefined()
    await band.press({ key: 'setup-next' })
    expect(await band.find({ key: 'setup-bias2' })).toBeDefined()
    await band.unmount()
  })

  test('Skip on the judge keeps the default judge and moves on; the footer then shows the gear', async ($, on) => {
    engine(on)
    mock.clock(on)
    const set = settings(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    await band.press({ key: 'setup-skip' })
    expect(set).toEqual([])
    expect(await drawn(band)).toContain('2/4')
    await band.press({ key: 'setup-close' })
    await band.unmount()
    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ key: 'setup' })).toBeUndefined()
    expect(await footer.find({ key: 'settings' })).toBeDefined()
    await footer.unmount()
  })

  test('Jev with a key already in the environment needs no second step', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' })
    mock.clock(on)
    settings(on)
    const said = toasts(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    await band.press({ key: 'setup-jev' })
    expect(said.join(' ')).toContain('Jev judges')
    expect(await drawn(band)).toContain('2/4')
    await band.press({ key: 'setup-close' })
    await band.unmount()
    await expect($.ui.mount(DESK)).rejects.toThrow()
  })
})

describe('judge failures are said', () => {
  test('judgeFailure names the cause', () => {
    expect(judgeFailure('Jev', 402)).toContain('out of credits')
    expect(judgeFailure('Jev', 429)).toContain('rate limited')
    expect(judgeFailure('Jev', 401)).toContain('rejected the key')
    expect(judgeFailure('Jev', 'timeout')).toContain('did not answer')
  })

  test('Jev out of credits: the person is told once, and Haiku judges', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' })
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    on('http.fetch', () => ({ value: { status: 402, ok: false, headers: {}, text: 'payment required' } }))
    const said: string[] = []
    on('ui.toast', (_$, e) => {
      said.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await $.prompt.submit({ text: 'first question here', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'second question here', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(2)
    expect(said.filter(t => t.includes('out of credits')).length).toBe(1)
    expect(said[0]).toContain('Haiku judges for now')
  })
})

describe('judge benchmark', () => {
  const c = (id: string, ok: ('low' | 'medium' | 'high')[], message = 'do a thing please') =>
    ({ id, kind: 'k', current: { model: 'sonnet', effort: 'medium' }, message, ok }) as never

  test('grades an answer as right, too low, too high or missing', () => {
    expect(benchGrade(c('a', ['medium', 'high']), 'high')).toBe('hit')
    expect(benchGrade(c('a', ['medium', 'high']), 'low')).toBe('under')
    expect(benchGrade(c('a', ['low']), 'xhigh')).toBe('over')
    expect(benchGrade(c('a', ['low']), undefined)).toBe('none')
  })

  test('the report counts per judge and lists the misses', () => {
    const cases = [c('a', ['low']), c('b', ['high'])]
    const report = benchReport(cases, [
      { id: 'a', judge: 'haiku', effort: 'low', ms: 300, tokens: 10 },
      { id: 'b', judge: 'haiku', effort: 'medium', ms: 500, tokens: 10 },
    ])
    expect(report).toContain('| haiku | 50% | 1 | 0 | 0 | 500 |')
    expect(report).toContain('haiku b: said medium, wanted high')
  })

  test('/effortless bench runs every case through Haiku, keeps follow-ups, and writes the report', async ($, on) => {
    engine(on)
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    const cases = { cases: [c('a', ['low'], 'rename foo to bar in utils.ts'), c('f', ['medium'], 'go')] }
    on('fs.read', (_$, e) => ({ value: String(e.path).endsWith('judge-cases.json') ? JSON.stringify(cases) : '' }) as never)
    const written: Record<string, string> = {}
    on('fs.write', (_$, e) => {
      written[String(e.path)] = String(e.text)
      return { value: undefined } as never
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const res = await $.command.run({ command: 'effortless', args: 'bench' })
    expect(asked.length).toBe(1)
    expect(res.text).toContain('| haiku | 100% |')
    expect(res.text).toContain('| always medium |')
    expect(Object.keys(written).some(p => p.endsWith('.md'))).toBe(true)
  })
})

describe('short answers to a question', () => {
  test('a short reply after a question goes to the judge; between two steps it keeps the effort', () => {
    const asked = 'user: tidy up\nassistant: Done. Should I archive it?'
    const told = 'user: add export\nassistant: Added the button. Next I wire it up.'
    expect(endsOnQuestion(asked)).toBe(true)
    expect(endsOnQuestion(told)).toBe(false)
    expect(endsOnQuestion('')).toBe(false)
    expect(keepsEffort('yes', asked)).toBe(false)
    expect(keepsEffort('go', told)).toBe(true)
    expect(keepsEffort('build the whole thing', told)).toBe(false)
  })

  test('"yes" to "should I archive it?" is judged, not kept', async ($, on) => {
    const said: { role: string; text: string }[] = []
    engine(on, {}, 'claude-sonnet-5-5', said)
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"high","why":"x"}')
    await $.prompt.submit({ text: 'refactor the sync engine end to end', wait: false, origin: { kind: 'composer' } })
    said.push({ role: 'assistant', text: 'Done. Should I archive the old branch?' })
    await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(2)
  })

  test('Jev unsure: Haiku makes the call', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' }, 'claude-sonnet-5-5')
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: jevReply('high', 0.3, 'sonnet') } }))
    await $.prompt.submit({ text: 'show me the last five commits please', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(1)
  })
})

describe('images', () => {
  test('the judge is told what the message carries', () => {
    expect(withAttachments('fix this', [{ type: 'image' }, { type: 'image' }])).toContain('[The message comes with 2 images to look at.]')
    expect(withAttachments('fix this')).toBe('fix this')
  })

  test('"fix this" with a screenshot is judged, not kept as a follow-up', async ($, on) => {
    engine(on, {}, 'claude-sonnet-5-5')
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"medium","why":"x"}')
    await $.prompt.submit({ text: 'refactor the sync engine end to end', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'fix this', wait: false, origin: { kind: 'composer' }, attachments: [{ type: 'image', mediaType: 'image/png' }] } as never)
    expect(asked.length).toBe(2)
    expect(asked[1]).toContain('1 image')
  })
})

describe('cold band', () => {
  test('shows above the prompt when the cache is cold, compacts in one click, and hides until the next cold', async ($, on) => {
    engine(on)
    mock.clock(on)
    on('session.compact', () => ({ value: { messages: [] } }) as never)
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const DESK = { plugin: 'effortless', surface: 'desktop', ...BAND } as never
    const guide = await $.ui.mount(DESK)
    await guide.press({ key: 'setup-haiku' })
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await $.command.run({ command: 'effortless', args: 'cold' })
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('Chat went cold')
    expect(await drawn(band)).toContain('class=\\"f\\"')
    await band.press({ key: 'cold-hide' })
    await band.unmount()
    await expect($.ui.mount(DESK)).rejects.toThrow()
  })
})

describe('handoff', () => {
  test('the first message carries the handoff and what to do next', () => {
    expect(handoffMessage(' the plan ', 'continue')).toBe(
      'Handoff from the previous chat:\n\nthe plan\n\nContinue with the next step. If it is marked "needs user", say what you need and wait.',
    )
    expect(handoffMessage('x', 'confirm')).toContain('then wait for me')
  })

  test('the prompt asks for checked work, marked user steps and git as of last check', () => {
    expect(HANDOFF_PROMPT).toContain('needs user')
    expect(HANDOFF_PROMPT).toContain('as of last check')
    expect(HANDOFF_PROMPT).toContain('Never present something planned, skipped or untested as done')
    expect(HANDOFF_PROMPT).toContain('Do not use tools')
  })

  /** Presses ⇥ in the footer, makes the choices in the handoff bar, and presses Go. */
  async function handOff($: Engine, footer: { press: (at: { key: string }) => Promise<unknown> }, keys: string[] = [], after?: string) {
    await footer.press({ key: 'handoff' })
    const bar = await $.ui.mount(DESK_BAND)
    for (const key of keys) await bar.press({ key })
    if (after) await bar.select({ key: 'handoff-after', value: after })
    await bar.press({ key: 'handoff-go' })
    await bar.unmount()
  }

  function handoffEngine(on: On) {
    mock.store(on)
    mock.env(on, { EFFORTLESS_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    const forked: string[] = []
    on('model.fork', (_$, e) => {
      forked.push(e.prompt)
      return { value: { isAnswered: true, text: 'Goal: quick.', usage: USAGE } } as never
    })
    const ran: string[] = []
    on('command.run', (_$, e) => {
      ran.push(e.command)
      return { text: 'ok' }
    })
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    return { forked, ran, submitted }
  }

  test('⇥ opens the handoff bar; it says what happens and starts nothing until Go', async ($, on) => {
    const { forked } = handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await footer.press({ key: 'handoff' })
    const bar = await $.ui.mount(DESK_BAND)
    await clickable(bar, 'handoff-actions')
    expect(await drawn(bar)).toContain('Handoff')
    expect(await drawn(bar)).toContain('Clears chat, carries on.')
    await bar.select({ key: 'handoff-after', value: 'copy' })
    expect(await drawn(bar)).toContain('chat stays')
    await mocked.advance(2500)
    expect(forked).toEqual([])
    await bar.press({ key: 'handoff-close' })
    await bar.unmount()
    const after = await $.ui.mount(DESK_BAND)
    expect(await after.find({ key: 'handoff-go' })).toBeUndefined()
    await after.unmount()
    await footer.unmount()
  })

  test('with a skill set, Quick forks and Full runs the skill', { options: { handoffSkill: 'session-handoff' } } as never, async ($, on) => {
    const { forked, ran } = handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, ['handoff-quick'])
    await mocked.advance(2500)
    expect(forked).toEqual([HANDOFF_PROMPT])
    expect(ran).not.toContain('session-handoff')
    expect(ran).toContain('clear')
    await handOff($, footer, ['handoff-full'])
    await mocked.advance(1000)
    expect(ran).toContain('session-handoff')
    expect(forked).toHaveLength(1)
    await footer.unmount()
  })

  test('the bar opens on the choice made last', { options: { handoffSkill: 'session-handoff' } } as never, async ($, on) => {
    handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, ['handoff-full'], 'confirm')
    await mocked.advance(1000)
    await $.turn.complete({ turnId: 't1', answer: 'Goal: full.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    await mocked.advance(1500)
    await footer.press({ key: 'handoff' })
    const bar = await $.ui.mount(DESK_BAND)
    expect(await drawn(bar)).toContain('/session-handoff, slower')
    expect(await drawn(bar)).toContain('then waits')
    await bar.unmount()
    await footer.unmount()
  })

  test('without a skill, Full says to pick one and Go does nothing', async ($, on) => {
    const { forked, ran } = handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await footer.press({ key: 'handoff' })
    const bar = await $.ui.mount(DESK_BAND)
    await bar.press({ key: 'handoff-full' })
    expect(await drawn(bar)).toContain('Full needs a skill')
    await bar.press({ key: 'handoff-go' })
    await mocked.advance(2500)
    expect(forked).toEqual([])
    expect(ran).not.toContain('clear')
    await bar.unmount()
    await footer.unmount()
  })

  test('Keep chat & copy copies the handoff and clears nothing', async ($, on) => {
    const { ran, submitted } = handoffEngine(on)
    const copied: string[] = []
    on('ui.copy', (_$, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, [], 'copy')
    await mocked.advance(2500)
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('Goal: quick.')
    expect(copied[0]).toContain('Continue with the next step.')
    expect(ran).not.toContain('clear')
    expect(submitted).toEqual([])
    await footer.unmount()
  })

  test('New chat & archive asks the model here to start the chat and archive this one', async ($, on) => {
    const { ran, submitted } = handoffEngine(on)
    const copied: string[] = []
    on('ui.copy', (_$, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, [], 'newchat')
    await mocked.advance(2500)
    expect(ran).not.toContain('clear')
    expect(copied[0]).toContain('Goal: quick.')
    const asked = submitted.at(-1) ?? ''
    expect(asked).toContain('spawn_task')
    expect(asked).toContain('archive_session')
    expect(asked).toContain('Goal: quick.')
    await footer.unmount()
  })

  test('if the clipboard refuses, the handoff goes in the prompt box', async ($, on) => {
    const { ran } = handoffEngine(on)
    on('ui.copy', () => ({ value: { isCopied: false, reason: 'no clipboard' } }) as never)
    const filled: string[] = []
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { value: { isFilled: true, text: e.text } } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, [], 'copy')
    await mocked.advance(2500)
    expect(filled.join('')).toContain('Goal: quick.')
    expect(ran).not.toContain('clear')
    await footer.unmount()
  })

  test('the handoff is written by a fork: no turn in the chat, then cleared and sent', async ($, on) => {
    mock.store(on)
    mock.env(on, { EFFORTLESS_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    const forked: string[] = []
    on('model.fork', (_$, e) => {
      forked.push(e.prompt)
      return { value: { isAnswered: true, text: 'Goal: fork it. Next: ship.', usage: USAGE } } as never
    })
    const ran: string[] = []
    on('command.run', (_$, e) => {
      ran.push(e.command)
      return { text: 'ok' }
    })
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer)
    await mocked.advance(1000)
    expect(forked).toEqual([HANDOFF_PROMPT])
    expect(submitted).not.toContain(HANDOFF_PROMPT)
    await mocked.advance(1500)
    expect(ran).toContain('clear')
    expect(submitted.at(-1)).toContain('Goal: fork it. Next: ship.')
    await footer.unmount()
  })

  test('without a fork (no reply yet, or it failed) the handoff is written as a turn, then cleared and sent', async ($, on) => {
    // engine() without its prompt.submit, so this test can see what the mod sends.
    mock.store(on)
    mock.env(on, { EFFORTLESS_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    const ran: string[] = []
    on('command.run', (_$, e) => {
      ran.push(e.command)
      return { text: 'ok' }
    })
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer)
    await mocked.advance(1000)
    expect(submitted.at(-1)).toBe(HANDOFF_PROMPT)
    await $.turn.complete({ turnId: 't9', answer: 'Goal: ship it. Next: tests.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    await mocked.advance(1500)
    expect(ran).toContain('clear')
    expect(submitted.at(-1)).toContain('Goal: ship it. Next: tests.')
    expect(submitted.at(-1)).toContain('Continue with the next step.')
    await footer.unmount()
  })

  test('a fork that writes nothing says why: in a toast and in /effortless debug, and the turn takes over', async ($, on) => {
    mock.store(on)
    mock.env(on, { EFFORTLESS_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('model.fork', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } }) as never)
    on('command.run', () => ({ text: 'ok' }))
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer)
    await mocked.advance(1000)
    expect(submitted.at(-1)).toBe(HANDOFF_PROMPT)
    expect(toasts.join(' ')).toContain('api-error 529 overloaded')
    const debug = String((await $.command.run({ command: 'effortless', args: 'debug' })).text)
    expect(debug).toContain('last fork: api-error 529 overloaded')
    await footer.unmount()
  })

  test('the fork outcome names the reason, or what an answer cost', () => {
    expect(forkOutcome({ isAnswered: false, reason: 'nothing-to-fork' }, 0)).toBe('nothing-to-fork (0.0s)')
    expect(forkOutcome({ isAnswered: false, reason: 'aborted', usage: USAGE }, 2500)).toBe('aborted (2.5s)')
    expect(forkOutcome({ isAnswered: false, reason: 'api-error', status: null, error: 'unknown', usage: USAGE }, 0)).toBe('api-error no response unknown (0.0s)')
    expect(forkOutcome(new Error('refused from a timer'), 100)).toBe('threw: refused from a timer (0.1s)')
    const usage = { input_tokens: 10, output_tokens: 700, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 }
    expect(forkOutcome({ isAnswered: true, text: 'Goal', usage }, 4000)).toBe('answered, 700 out, 90% cached (4.0s)')
    expect(forkOutcome({ isAnswered: true, text: '  ', usage }, 0)).toBe('answered with blank text (0.0s)')
  })
})

describe('swamp band and setup entry', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('the swamp band waits for the threshold set: 21% of a 1M window is not swamped at the default 50%', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 208_000, window: 1_000_000, percent: 21 } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    // Nothing to draw above the prompt: the engine has no band to mount.
    const band = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(band ? await drawn(band) : '').not.toContain('Chat is getting swamped')
    await band?.unmount()
  })

  test('at a 20% threshold the same chat is swamped', { options: { swampAt: '20' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 208_000, window: 1_000_000, percent: 21 } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Chat is getting swamped')
    await band.unmount()
  })

  test('a swamped context shows Compact and Handoff above the prompt; closing hides it until the context grows', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    let tokens = 180_000
    on('session.usage', () => ({ value: { context: { tokens, window: 300_000, percent: Math.round(tokens / 3_000) } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Chat is getting swamped')
    expect(await drawn(band)).toContain('180k tokens')
    expect(await band.find({ key: 'swamp-compact' })).toBeDefined()
    expect(await band.find({ key: 'swamp-handoff' })).toBeDefined()
    await band.press({ key: 'swamp-close' })
    await band.unmount()
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    tokens = 240_000
    await mocked.advance(16_000)
    const again = await $.ui.mount(DESK_BAND)
    expect(await drawn(again)).toContain('240k tokens')
    await again.unmount()
  })

  test('while compacting, the swamp band says so and its buttons step aside', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    let release = () => {}
    on('command.run', (_$, e) => {
      if (e.command !== 'compact') return { text: 'ok' }
      return new Promise(resolve => {
        release = () => resolve({ text: 'ok' })
      }) as never
    })
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 300_000, percent: 67 } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    const pressed = band.press({ key: 'swamp-compact' })
    await mocked.advance(100)
    const during = await $.ui.mount(DESK_BAND)
    expect(await drawn(during)).toContain('Compacting the chat')
    expect(await during.find({ key: 'swamp-compact' })).toBeUndefined()
    expect(await during.find({ key: 'swamp-handoff' })).toBeUndefined()
    release()
    await pressed
    await during.unmount()
    await band.unmount()
  })

  test('a swamp card hangs under the newest reply only, and goes when a new reply lands', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 300_000, percent: 67 } } }) as never)
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    // The app's own drawing of a reply block, beneath the plugin.
    on('ui.render', { component: 'AssistantMessage' }, (h, e) => {
      const { Text } = h.ui.resolve(e)
      return Text({ children: e.props.text } as never) as never
    })
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const reply = (text: string) =>
      ({ plugin: 'effortless', surface: 'desktop', component: 'AssistantMessage', props: { text, isFirstOfReply: true } }) as never
    await $.turn.complete({ turnId: 't1', answer: 'First answer.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const first = await $.ui.mount(reply('First answer.'))
    expect(await drawn(first)).toContain('Chat is getting swamped')
    expect(await drawn(first)).toContain('/effortless panel')
    await first.unmount()
    await $.turn.complete({ turnId: 't2', answer: 'Second answer.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const old = await $.ui.mount(reply('First answer.'))
    expect(await old.find({ key: 'reply-warn' })).toBeUndefined()
    await old.unmount()
    const newest = await $.ui.mount(reply('Second answer.'))
    expect(await newest.find({ key: 'reply-warn' })).toBeDefined()
    await newest.unmount()
  })

  test('/effortless panel opens a side panel with the warning and its buttons', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 300_000, percent: 67 } } }) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('ui.close', () => ({ value: undefined }) as never)
    await start($, on)
    await mocked.advance(16_000)
    expect(String((await $.command.run({ command: 'effortless', args: 'panel' })).text)).toContain('panel open')
    const panel = await $.ui.mount({ plugin: 'effortless', surface: 'desktop', component: 'Pane', requestId: 'effortless-panel', props: {} } as never)
    expect(await drawn(panel)).toContain('Chat is getting swamped')
    expect(await panel.find({ key: 'panel-compact' })).toBeDefined()
    expect(await panel.find({ key: 'panel-handoff' })).toBeDefined()
    await panel.unmount()
    expect(String((await $.command.run({ command: 'effortless', args: 'panel' })).text)).toContain('panel closed')
  })

  test('/effortless save switches save mode on and off', async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    expect(String((await $.command.run({ command: 'effortless', args: 'save' })).text)).toContain('save mode on')
    expect(String((await $.command.run({ command: 'effortless', args: 'save' })).text)).toContain('save mode off')
  })

  test('the setup can be closed with the cross; the footer then offers Setup, which opens it again', async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ key: 'setup' })).toBeDefined()
    await footer.press({ key: 'setup' })
    const reopened = await $.ui.mount(DESK_BAND)
    expect(await reopened.find({ key: 'setup-jev' })).toBeDefined()
    await reopened.press({ key: 'setup-haiku' })
    await reopened.press({ key: 'setup-close' })
    await reopened.unmount()
    expect(await footer.find({ key: 'setup' })).toBeUndefined()
    // Once set up, the same place is a gear that opens the settings panel.
    await footer.press({ key: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    expect(await drawn(panel)).toContain('effortless settings')
    await panel.unmount()
    await footer.unmount()
  })
})

describe('running hot and judge down', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('save mode caps at medium, and reset times read short', () => {
    expect(capped('xhigh', true)).toBe('medium')
    expect(capped('low', true)).toBe('low')
    expect(capped('xhigh', false)).toBe('xhigh')
    const now = new Date('2026-10-06T10:00:00').getTime()
    expect(resetLabel('2026-10-06T14:20:00', now)).toBe('14:20')
    expect(resetLabel(null, now)).toBe('')
  })

  test('a limit past 80% shows the running-hot band; save mode can be switched on', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [
      { kind: 'five_hour', percentUsed: 84, resetsAt: '2026-10-06T14:20:00Z' },
      { kind: 'seven_day', percentUsed: 40 },
    ] } }) as never)
    const said: string[] = []
    on('ui.toast', (_$, e) => {
      said.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Running hot')
    expect(await drawn(band)).toContain('84% of your 5h limit used')
    await band.press({ key: 'hot-save' })
    expect(said.join(' ')).toContain('save mode on')
    await band.unmount()
  })

  test('a failing judge shows the judge-down band until it answers again', async ($, on) => {
    engine(on, { TYPESAFE_API_KEY: 'k' })
    mock.clock(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    let status = 402
    on('http.fetch', () => ({ value: status === 200
      ? { status: 200, ok: true, headers: {}, text: jevReply('high', 0.9, 'sonnet') }
      : { status, ok: false, headers: {}, text: 'payment required' } }))
    on('ui.toast', () => ({ value: undefined }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await $.prompt.submit({ text: 'refactor the sync engine end to end', wait: false, origin: { kind: 'composer' } })
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Judge down')
    expect(await drawn(band)).toContain('out of credits')
    await band.unmount()
    status = 200
    await $.prompt.submit({ text: 'now write tests for the queue module', wait: false, origin: { kind: 'composer' } })
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
  })
})

describe('settings panel', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('the slider tips only close calls; floor and ceiling clamp; the key line is set in place', () => {
    expect(tipped('medium', 0.6, 1)).toBe('high')
    expect(tipped('medium', 0.9, 1)).toBe('medium')
    expect(tipped('medium', 0.8, 1)).toBe('medium')
    expect(tipped('medium', 0.8, 2)).toBe('high')
    expect(tipped('medium', 0.6, -1)).toBe('low')
    expect(tipped('low', 0.3, -2)).toBe('low')
    expect(tipped('medium', undefined, 2)).toBe('medium')
    expect(bounded('low', 'medium', 'max')).toBe('medium')
    expect(bounded('max', 'low', 'high')).toBe('high')
    expect(withJevKey('A=1\nTYPESAFE_API_KEY=old\n', 'new')).toBe('A=1\nTYPESAFE_API_KEY=new\n')
    expect(withJevKey('A=1', 'new')).toBe('A=1\nTYPESAFE_API_KEY=new\n')
    expect(parseVerdict('{"model":"opus","effort":"high","sure":0.7,"why":"x"}')?.sure).toBe(0.7)
  })

  test('Open settings opens the panel; the slider, range and key are saved from it', async ($, on) => {
    engine(on, { USERPROFILE: 'C:/Users/x' })
    mock.clock(on)
    const set: { key: string; value: unknown }[] = []
    on('config.set', (_$, e) => {
      set.push({ key: e.key, value: e.value })
      return { value: e.value } as never
    })
    const files: Record<string, string> = { 'C:/Users/x/.config/jev/.env': 'OTHER=1\n' }
    const at = (path: string) => path.split('\\').join('/')
    on('fs.read', (_$, e) => ({ value: files[at(e.path)] ?? '' }) as never)
    on('fs.write', (_$, e) => {
      files[at(e.path)] = e.text
      return { value: undefined } as never
    })
    const said: string[] = []
    on('ui.toast', (_$, e) => {
      said.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await $.command.run({ command: 'effortless', args: 'down' } as never)
    const down = await $.ui.mount(DESK_BAND)
    await down.press({ key: 'down-settings' })
    await down.unmount()
    const panel = await $.ui.mount(DESK_BAND)
    expect(await drawn(panel)).toContain('effortless settings')
    await panel.press({ key: 'bias3' })
    await panel.select({ key: 'settings-floor', value: 'medium' })
    await panel.input({ key: 'settings-key', text: ' tk-new ' })
    await panel.select({ key: 'settings-skill', value: 'session-handoff' })
    await panel.press({ key: 'show-swamp' })
    await panel.press({ key: 'show-handoff' })
    expect(set).toEqual([])
    await panel.press({ key: 'settings-save' })
    expect(set).toContainEqual({ key: 'effortless.hide', value: 'swamp,handoff' })
    expect(set).toContainEqual({ key: 'effortless.handoffSkill', value: 'session-handoff' })
    expect(set).toContainEqual({ key: 'effortless.effortBias', value: '1' })
    expect(set).toContainEqual({ key: 'effortless.effortFloor', value: 'medium' })
    expect(set).toContainEqual({ key: 'effortless.judge', value: 'jev' })
    expect(said.join(' | ')).toContain('key saved')
    expect(files['C:/Users/x/.config/jev/.env']).toBe('OTHER=1\nTYPESAFE_API_KEY=tk-new\n')
    await panel.unmount()
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
  })
})

describe('switching parts off', () => {
  test('readConfig keeps only known parts', () => {
    expect(readConfig({ hide: 'swamp, handoff,bogus' }).hide).toEqual(['swamp', 'handoff'])
  })

  test('a hidden handoff button is not in the footer; a hidden swamp band does not show', { options: { hide: 'handoff,swamp' } } as never, async ($, on) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 180_000, window: 1_000_000, percent: 18 } } }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ key: 'handoff' })).toBeUndefined()
    await footer.unmount()
  })
})

describe('the command file', () => {
  test('/effortless:effortless, as the app may name the command file, is answered by the mod', async ($, on) => {
    engine(on)
    mock.clock(on)
    const answer = await $.command.run({ command: 'effortless:effortless', args: 'settings' } as never)
    expect(String((answer as { text?: string }).text)).toContain('settings are open')
  })
})


describe('progress bar', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    // The first-run guide comes before the bar: closed here.
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
  }

  /** The tools the bar watches, answered as the engine would; the sounds played, by file. */
  const tools = (on: On) => {
    let nextTask = 0
    on('tool.call', (_$, e) => {
      if (e.tool === 'TaskCreate') return { result: { task: { id: String(++nextTask), subject: e.subject } } } as never
      if (e.tool === 'TaskUpdate') return { result: { success: true, taskId: e.taskId, updatedFields: [] } } as never
      if (e.tool === 'AskUserQuestion') return { result: { answers: {} } } as never
      return { result: { oldTodos: [], newTodos: [] } } as never
    })
    const played: string[] = []
    on('process.run', (_$, e) => {
      played.push(e.argv.join(' '))
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    on('audio.play', (_$, e) => {
      played.push(String((e.clip as { asset?: string }).asset))
      return { value: undefined } as never
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    return played
  }

  const todos = (statuses: ('pending' | 'in_progress' | 'completed')[]) =>
    statuses.map((status, i) => ({ content: `Step ${i + 1}`, activeForm: `Doing step ${i + 1}`, status }))

  const endTurn = ($: Engine, answer: string, reason = 'answer') =>
    $.turn.complete({ turnId: 't1', answer, durationMs: 1, isAborted: reason === 'aborted', reason } as never)

  test('the steps: share, number and the one named', () => {
    const steps = stepsFromTodos(todos(['completed', 'in_progress', 'pending', 'pending']))
    expect(progressShare(steps)).toBe(1.5 / 4)
    expect(stepNumber(steps)).toBe(2)
    expect(currentStep(steps)?.doing).toBe('Doing step 2')
    expect(stepNumber(stepsFromTodos(todos(['completed', 'completed', 'completed'])))).toBe(3)
    expect(progressShare([])).toBe(0)
  })

  test('tasks are added, updated and deleted by id', () => {
    let steps = withTaskCreated([], '1', { subject: 'Read', activeForm: 'Reading' })
    steps = withTaskCreated(steps, '2', { subject: 'Write' })
    steps = withTaskUpdated(steps, { taskId: '1', status: 'in_progress' })
    expect(steps.map(s => [s.id, s.status, s.doing])).toEqual([['1', 'in_progress', 'Reading'], ['2', 'pending', 'Write']])
    expect(withTaskUpdated(steps, { taskId: '2', status: 'deleted' }).map(s => s.id)).toEqual(['1'])
  })

  test('a turn ends done, asking or paused; too short a list ends the bar', () => {
    const q = endsOnQuestion
    const p = (s: ('pending' | 'in_progress' | 'completed')[]) => ({ phase: 'working' as const, steps: stepsFromTodos(todos(s)) })
    expect(phaseAtTurnEnd(p(['completed', 'completed', 'completed']), { reason: 'answer', answer: 'All done.' }, q)).toBe('done')
    expect(phaseAtTurnEnd(p(['completed', 'pending', 'pending']), { reason: 'answer', answer: 'Should I go on?' }, q)).toBe('asking')
    expect(phaseAtTurnEnd(p(['completed', 'pending', 'pending']), { reason: 'aborted', answer: '' }, q)).toBe('paused')
    expect(phaseAtTurnEnd(p(['completed', 'pending']), { reason: 'answer', answer: '' }, q)).toBeNull()
  })

  test('a prompt carries an asking or paused task on and ends a finished one; slash commands change nothing', () => {
    const steps = stepsFromTodos(todos(['completed', 'pending', 'pending']))
    const said = { text: 'yes', origin: { kind: 'composer' } }
    expect(afterPrompt({ phase: 'asking', steps }, said)?.phase).toBe('working')
    expect(afterPrompt({ phase: 'paused', steps }, said)?.phase).toBe('working')
    expect(afterPrompt({ phase: 'done', steps }, said)).toBeNull()
    expect(afterPrompt({ phase: 'done', steps }, { text: '/effortless debug', origin: { kind: 'composer' } })?.phase).toBe('done')
  })

  test('where it shows, what it says, and when the judge calls a turn big', () => {
    const steps = stepsFromTodos(todos(['completed', 'in_progress', 'pending']))
    expect(progressShows({ phase: 'working', steps }, null, 'active')).toBe(true)
    expect(progressShows({ phase: 'working', steps }, null, 'resting')).toBe(false)
    expect(progressShows({ phase: 'done', steps }, null, 'active')).toBe(true)
    expect(progressShows({ phase: 'paused', steps }, null, 'resting')).toBe(true)
    expect(progressShows({ phase: 'working', steps }, 'Step 1\nStep 2\nStep 3', 'active')).toBe(false)
    expect(progressShows({ phase: 'working', steps: steps.slice(0, 2) }, null, 'active')).toBe(false)
    expect(progressTitle({ phase: 'asking', steps })).toBe('Waiting for your answer · step 2 of 3')
    expect(progressTitle({ phase: 'done', steps })).toBe('Done · all 3 steps')
    expect(isBigPick({ model: 'opus', effort: 'high', why: '', by: 'jev' })).toBe(true)
    expect(isBigPick({ model: 'opus', effort: 'high', why: '', by: 'manual' })).toBe(false)
    expect(isBigPick({ model: 'opus', effort: 'medium', why: '', by: 'haiku' })).toBe(false)
  })

  test('Windows plays the chime with PowerShell; elsewhere the app plays it', () => {
    const argv = soundArgv('C:\\Users\\x\\plugins\\effortless', 'sounds/done.wav')
    expect(argv?.[0]).toBe('powershell.exe')
    expect(argv?.join(' ')).toContain("SoundPlayer 'C:\\Users\\x\\plugins\\effortless\\sounds\\done.wav'")
    expect(soundArgv('/Users/x/.claude/plugins/effortless', 'sounds/done.wav')).toBeNull()
  })

  test('a step list fills the bar, names the step, and turns green with a chime when every step is done', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const played = tools(on)
    await start($, on)
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['completed', 'in_progress', 'pending', 'pending']) } as never)
    const band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'progress-bar' })).toBeDefined()
    expect(await drawn(band)).toContain('Step 2 of 4')
    expect(await drawn(band)).toContain('Doing step 2')
    // On desktop the track is one still image, never a row of line characters.
    expect(await drawn(band)).toContain('<svg')
    expect(await drawn(band)).not.toContain('━')
    // Two animated images, each given both sizes (an interactive Svg without them gets a 300 by 150 frame): the art
    // behind the band and the current step's pill.
    expect((await drawn(band)).match(/isInteractive/g)?.length).toBe(2)
    await band.unmount()
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['completed', 'completed', 'completed', 'completed']) } as never)
    await endTurn($, 'All four steps are done.')
    await mocked.advance(1000)
    const green = await $.ui.mount(DESK_BAND)
    expect(await drawn(green)).toContain('Done · all 4 steps')
    expect(played.join('\n')).toContain('done.wav')
    // The next prompt ends a finished task.
    await green.unmount()
    await $.prompt.submit({ text: 'thanks', wait: false, origin: { kind: 'composer' } })
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
  })

  test('a turn that ends on a question turns the bar yellow with a chime; the answer carries it on', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const played = tools(on)
    await start($, on)
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['completed', 'in_progress', 'pending']) } as never)
    await endTurn($, 'The tests pass. Should I go on with the docs?')
    await mocked.advance(1000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Waiting for your answer')
    expect(played.join('\n')).toContain('question.wav')
    await band.unmount()
    await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
    const again = await $.ui.mount(DESK_BAND)
    expect(await drawn(again)).toContain('Step 2 of 3')
    await again.unmount()
  })

  test('AskUserQuestion chimes while it asks; tasks from TaskCreate and TaskUpdate count as steps', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const played = tools(on)
    await start($, on)
    for (const subject of ['Read', 'Build', 'Test']) await $.tool.call({ tool: 'TaskCreate', subject, description: subject } as never)
    await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)
    await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress', activeForm: 'Building it' } as never)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Building it')
    await band.unmount()
    await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await mocked.advance(1000)
    expect(played.join('\n')).toContain('question.wav')
    // Answered: back to work.
    const after = await $.ui.mount(DESK_BAND)
    expect(await drawn(after)).toContain('Step 2 of 3')
    await after.unmount()
  })

  test('a list of two steps draws nothing; the cross hides a list until another one comes', async ($, on) => {
    engine(on)
    mock.clock(on)
    tools(on)
    await start($, on)
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['in_progress', 'pending']) } as never)
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['in_progress', 'pending', 'pending']) } as never)
    const band = await $.ui.mount(DESK_BAND)
    await band.press({ key: 'progress-close' })
    await band.unmount()
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['in_progress', 'pending', 'pending', 'pending']) } as never)
    const back = await $.ui.mount(DESK_BAND)
    expect(await drawn(back)).toContain('Step 1 of 4')
    await back.unmount()
  })

  test('a turn the judge calls big shows Planning until a list comes; with none it goes quietly', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const played = tools(on)
    judgeSays(on, '{"model":"opus","effort":"high","why":"big job"}')
    await start($, on)
    await $.prompt.submit({ text: 'go through the whole repo and clean it up', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'go through the whole repo', turnId: 't1' } as never)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Planning a bigger task')
    await band.unmount()
    await endTurn($, 'Nothing needed cleaning.')
    await mocked.advance(1000)
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    expect(played).toEqual([])
  })

  test('/effortless progress shows the bar working, asking and done, then clears it', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const played = tools(on)
    await start($, on)
    await $.command.run({ command: 'effortless', args: 'progress' })
    let band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Step 3 of 5')
    await band.unmount()
    await $.command.run({ command: 'effortless', args: 'progress done' })
    await mocked.advance(1000)
    band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Done · all 5 steps')
    await band.unmount()
    expect(played.join('\n')).toContain('done.wav')
    await $.command.run({ command: 'effortless', args: 'progress clear' })
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
  })

  test('switched off, the bar is never drawn and nothing plays', { options: { hide: 'progress' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const played = tools(on)
    await start($, on)
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['completed', 'completed', 'completed']) } as never)
    await endTurn($, 'Done.')
    await mocked.advance(1000)
    await expect($.ui.mount(DESK_BAND)).rejects.toThrow()
    expect(played).toEqual([])
  })

  test('with sounds off the bar still turns green, silently', { options: { hide: 'sounds' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const played = tools(on)
    await start($, on)
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['completed', 'completed', 'completed']) } as never)
    await endTurn($, 'Done.')
    await mocked.advance(1000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Done · all 3 steps')
    await band.unmount()
    expect(played).toEqual([])
  })

  test('the bar draws on the terminal too, and as one row when there is little room', async ($, on) => {
    engine(on)
    mock.clock(on)
    tools(on)
    await start($, on)
    await $.command.run({ command: 'effortless', args: 'progress ask' })
    for (const maxRows of [10, 3]) {
      const band = await $.ui.mount({ plugin: 'effortless', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows } } as never)
      expect(await drawn(band)).toContain('Waiting for your answer')
      expect(Boolean(await band.find({ key: 'progress-track' }))).toBe(maxRows >= 4)
      expect(Boolean(await band.find({ key: 'progress-blocks' }))).toBe(maxRows < 4)
      await band.unmount()
    }
  })
  test('a finished task shows before the swamp band; the next message gives the band back', async ($, on) => {
    engine(on)
    mock.clock(on)
    tools(on)
    await start($, on)
    await $.command.run({ command: 'effortless', args: 'swamp' })
    await $.command.run({ command: 'effortless', args: 'progress done' })
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Done · all 5 steps')
    expect(await band.find({ key: 'progress-art' })).toBeDefined()
    await band.unmount()
    await $.prompt.submit({ text: 'thanks', wait: false, origin: { kind: 'composer' } })
    const after = await $.ui.mount(DESK_BAND)
    expect(await drawn(after)).toContain('swamped')
    await after.unmount()
  })
})
