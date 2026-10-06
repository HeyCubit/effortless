import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { tipped, bounded, withJevKey, parseVerdict, capped, resetLabel, HANDOFF_PROMPT, handoffMessage, withAttachments, endsOnQuestion, keepsEffort, benchGrade, benchReport, judgeFailure, contextFrom, readConfig, parseChatCompletion, asSpent, cacheColor, cacheLabel, cacheSafe, cacheTtlOf, mostlyCached, isFollowUp, parseJevAnswer, parseJevKey, savedText } from '../hooks/register'

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
    // No background at rest: the only ones are in the hover styles.
    expect(text.replaceAll('"backgroundColor":"#2b2b2f"}', '')).not.toContain('backgroundColor')
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
    await noBand($, DESK_BAND)
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
    if (await band.find({ key: 'setup-haiku' })) await band.press({ key: 'setup-haiku' })
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
    await guide.unmount()
    await noBand($, DESK_BAND)
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
    })
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

  test('opens by itself the first time; Haiku is one click and needs nothing more; it does not open again', async ($, on) => {
    engine(on)
    mock.clock(on)
    const set = settings(on)
    const said = toasts(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    expect(await band.find({ key: 'setup-haiku' })).toBeDefined()
    expect(await band.find({ key: 'setup-open' })).toBeUndefined()
    // Branded: the name in the footer's purple.
    expect(await drawn(band)).toContain('"color":"#a79cf7"')
    expect(await drawn(band)).toContain('✦ effortless')
    expect(await drawn(band)).toContain('Jev (API)')
    // The right side: an interactive SVG (so its sparkles animate), a gradient, and sparkles that twinkle.
    const first = await drawn(band)
    expect(first).toContain('"type":"Svg"')
    expect(first).toContain('"isInteractive":true')
    expect(first).toContain('linearGradient')
    expect((first.match(/class=\\"sp\\"/g) ?? []).length).toBeGreaterThanOrEqual(8)
    await band.press({ key: 'setup-haiku' })
    expect(set).toEqual([{ key: 'effortless.judge', value: 'haiku' }])
    expect(said.join(' ')).toContain('Haiku judges')
    await band.unmount()
    await noBand($, DESK)

    // A new session: the guide stays closed; /effortless setup opens it again.
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await noBand($, DESK)
    await $.command.run({ command: 'effortless', args: 'setup' })
    const again = await $.ui.mount(DESK)
    expect(await again.find({ key: 'setup-jev' })).toBeDefined()
    await again.unmount()
  })

  test('Jev without a key asks only for the key, and Open settings opens the panel with the key field', async ($, on) => {
    engine(on)
    mock.clock(on)
    const set = settings(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    await band.press({ key: 'setup-jev' })
    expect(set).toEqual([{ key: 'effortless.judge', value: 'jev' }])
    expect(await drawn(band)).toContain('TypeSafe key')
    expect(await drawn(band)).toContain('typesafe.ai')
    expect(await band.find({ key: 'setup-haiku' })).toBeUndefined()
    await band.press({ key: 'setup-open' })
    await band.unmount()
    const panel = await $.ui.mount(DESK)
    expect(await panel.find({ key: 'settings-key' })).toBeDefined()
    await panel.press({ key: 'settings-close' })
    await panel.unmount()
    await noBand($, DESK)
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
    await band.unmount()
    await noBand($, DESK)
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
    await guide.unmount()
    await $.command.run({ command: 'effortless', args: 'cold' })
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('Chat went cold')
    expect(await drawn(band)).toContain('class=\\"f\\"')
    await band.press({ key: 'cold-hide' })
    await band.unmount()
    await noBand($, DESK)
  })
})

describe('handoff', () => {
  test('the first message carries the handoff and what to do next', () => {
    expect(handoffMessage(' the plan ', 'continue')).toBe('Handoff from the previous chat:\n\nthe plan\n\nContinue with the next step.')
    expect(handoffMessage('x', 'confirm')).toContain('then wait for me')
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
    await footer.press({ key: 'handoff' })
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
    await footer.press({ key: 'handoff' })
    expect(submitted.at(-1)).toBe(HANDOFF_PROMPT)
    await $.turn.complete({ turnId: 't9', answer: 'Goal: ship it. Next: tests.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    await mocked.advance(1500)
    expect(ran).toContain('clear')
    expect(submitted.at(-1)).toContain('Goal: ship it. Next: tests.')
    expect(submitted.at(-1)).toContain('Continue with the next step.')
    await footer.unmount()
  })
})

describe('swamp band and setup entry', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('a swamped context shows Compact and Handoff above the prompt; closing hides it until the context grows', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    let tokens = 180_000
    on('session.usage', () => ({ value: { context: { tokens, window: 1_000_000, percent: Math.round(tokens / 10_000) } } }) as never)
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
    await noBand($, DESK_BAND)
    tokens = 240_000
    await mocked.advance(16_000)
    const again = await $.ui.mount(DESK_BAND)
    expect(await drawn(again)).toContain('240k tokens')
    await again.unmount()
  })

  test('the setup can be closed with the cross; the footer then offers Setup, which opens it again', async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await noBand($, DESK_BAND)
    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ key: 'setup' })).toBeDefined()
    await footer.press({ key: 'setup' })
    const reopened = await $.ui.mount(DESK_BAND)
    expect(await reopened.find({ key: 'setup-jev' })).toBeDefined()
    await reopened.press({ key: 'setup-haiku' })
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
    await noBand($, DESK_BAND)
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
    await noBand($, DESK_BAND)
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
    await noBand($, DESK_BAND)
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
