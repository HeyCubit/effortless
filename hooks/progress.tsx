import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { Pick, Progress, ProgressStep } from '../types'

// The progress bar: a band above the prompt that follows a bigger task step by step (docs/specs/2026-10-06-progress-bar.md).
// Its own file, so the branches that edit register.tsx meet it in a few lines only. The engine follows $ only into
// functions of the file it is in, so what needs $ in a hook register.tsx already holds (session.start, prompt.submit,
// turn.complete, the band) is a short section there; the rules and the drawing are here.

/** A list shorter than this is no bigger task: no bar. */
export const MIN_STEPS = 3
/** Past this many steps the bar is one continuous fill instead of a segment per step. */
const SEGMENTS_MAX = 12

// The brand purple, as in register.tsx, and the two signal sets: yellow when Claude asks, green when it is done.
const LOOKS: Record<Progress['phase'], { color: string; bg: string; edge: string }> = {
  planning: { color: '#a79cf7', bg: '#15121f', edge: '#4a3f80' },
  working: { color: '#a79cf7', bg: '#15121f', edge: '#4a3f80' },
  paused: { color: '#7d76a8', bg: '#15121f', edge: '#3a3360' },
  asking: { color: '#e0a33a', bg: '#1c1608', edge: '#6b5218' },
  done: { color: '#6fcf8e', bg: '#0e1a12', edge: '#2f6b45' },
}
// Every segment holds the same long run of one character and is clipped to its share: equal content, equal width.
const RUN = 160

const progressState = atom({ plugin: 'effortless', key: 'progress' } as const, null)
// What the next turn runs with, as register.tsx sets it; read here only.
const pick = atom({ plugin: 'effortless', key: 'pick' } as const, null)

export type Cue = 'question' | 'done'

/** A pick the judge made at high effort or above: the turn is a bigger task. A pick of your own says nothing of size. */
export function isBigPick(p: Pick | null): boolean {
  return Boolean(p && p.by !== 'manual' && ['high', 'xhigh', 'max'].includes(p.effort))
}

type Todo = { content: string; status: ProgressStep['status']; activeForm?: string }

/** The steps of a TodoWrite list, the whole list each time. */
export function stepsFromTodos(todos: readonly Todo[]): ProgressStep[] {
  return todos.map((t, i) => ({ id: `todo-${i}`, label: t.content, doing: t.activeForm || t.content, status: t.status }))
}

/** The steps with a task TaskCreate made added at the end, pending. */
export function withTaskCreated(steps: readonly ProgressStep[], id: string, task: { subject: string; activeForm?: string }): ProgressStep[] {
  return [...steps.filter(s => s.id !== id), { id, label: task.subject, doing: task.activeForm || task.subject, status: 'pending' }]
}

/** The steps after a TaskUpdate: a new status, subject or running form; deleted drops the step. */
export function withTaskUpdated(
  steps: readonly ProgressStep[],
  change: { taskId: string; status?: ProgressStep['status'] | 'deleted'; subject?: string; activeForm?: string },
): ProgressStep[] {
  if (change.status === 'deleted') return steps.filter(s => s.id !== change.taskId)
  return steps.map(s =>
    s.id !== change.taskId
      ? s
      : {
          ...s,
          ...(change.status ? { status: change.status } : {}),
          ...(change.subject ? { label: change.subject } : {}),
          ...(change.activeForm ? { doing: change.activeForm } : {}),
        },
  )
}

/** How far along the task is, 0 to 1: completed steps, and half of each one in progress. */
export function progressShare(steps: readonly ProgressStep[]): number {
  if (!steps.length) return 0
  const done = steps.filter(s => s.status === 'completed').length
  const doing = steps.filter(s => s.status === 'in_progress').length
  return Math.min(1, (done + doing / 2) / steps.length)
}

/** The step to name: the one in progress, else the next pending one. */
export function currentStep(steps: readonly ProgressStep[]): ProgressStep | undefined {
  return steps.find(s => s.status === 'in_progress') ?? steps.find(s => s.status === 'pending')
}

/** Which step the task is at, counted from 1: the steps completed plus one, at most all of them. */
export function stepNumber(steps: readonly ProgressStep[]): number {
  return Math.min(steps.length, steps.filter(s => s.status === 'completed').length + 1)
}

/** The list as one string: closing the bar hides it for this list until another one comes. */
export function stepsKey(steps: readonly ProgressStep[]): string {
  return steps.map(s => s.label).join('\n')
}

/**
 * Where the task stands when a main-conversation turn ends: done when every step is completed, asking when the answer
 * ends on a question, paused otherwise; null when there is nothing to follow (no list came, or too short a one).
 */
export function phaseAtTurnEnd(
  p: Progress,
  turn: { reason: string; answer: string },
  endsOnQuestion: (context: string) => boolean,
): Progress['phase'] | null {
  if (p.steps.length < MIN_STEPS) return null
  if (p.steps.every(s => s.status === 'completed')) return 'done'
  if (turn.reason === 'answer' && endsOnQuestion(`assistant: ${turn.answer}`)) return 'asking'
  return 'paused'
}

/** The bar after a turn ends, and the sound to play: a chime when it turns done or asking. */
export function atTurnEnd(
  p: Progress | null,
  turn: { reason: string; answer: string },
  endsOnQuestion: (context: string) => boolean,
): { next: Progress | null; cue?: Cue } {
  if (!p) return { next: null }
  const phase = phaseAtTurnEnd(p, turn, endsOnQuestion)
  if (phase === null) return { next: null }
  if (phase === p.phase) return { next: p }
  return { next: { ...p, phase }, ...(phase === 'done' ? { cue: 'done' } : phase === 'asking' ? { cue: 'question' } : {}) }
}

/** The bar after the person sends a prompt: a finished task is over; an asking or paused one carries on. */
export function afterPrompt(p: Progress | null, prompt: { text: string; origin: { kind: string } }): Progress | null {
  const byPerson = prompt.origin.kind === 'composer' || prompt.origin.kind === 'bridge' || prompt.origin.kind === 'sdk'
  if (!p || !byPerson || prompt.text.trim().startsWith('/')) return p
  if (p.phase === 'done') return null
  return p.phase === 'asking' || p.phase === 'paused' ? { ...p, phase: 'working' } : p
}

/**
 * How Windows plays a sound: `$.audio.play` plays nothing in a Windows terminal, so PowerShell's SoundPlayer plays the
 * file. Null on other systems, where `$.audio.play` does it.
 */
export function soundArgv(root: string, file: string): string[] | null {
  if (!/^[A-Za-z]:[\\/]/.test(root)) return null
  const path = `${root.replace(/[\\/]+$/, '')}\\${file}`.replace(/\//g, '\\').replace(/'/g, "''")
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${path}').PlaySync()`]
}

// Sounds wait here for the session's timer (register.tsx plays them): a hook's own $ is refused once the hook has
// returned, and a sound should not hold the turn up while it plays.
let cues: Cue[] = []

/** Queues a sound, unless sounds are switched off. */
export function queueCue(hidden: readonly string[], sound: Cue | undefined) {
  if (sound && !hidden.includes('sounds') && !hidden.includes('progress')) cues.push(sound)
}

/** The queued sounds, taken off the queue. */
export function takeCues(): Cue[] {
  const due = cues
  cues = []
  return due
}

/** /effortless progress [ask|done|clear]: a demo task of five steps in the state asked for, to see the bar. */
export function demoProgress(arg: string): { progress: Progress | null; cue?: Cue; text: string } {
  const demo = (completed: number, doing: boolean): ProgressStep[] =>
    [
      ['Read the code', 'Reading the code'],
      ['Write the tests', 'Writing the tests'],
      ['Build the bar', 'Building the bar'],
      ['Run the tests', 'Running the tests'],
      ['Write the handoff', 'Writing the handoff'],
    ].map(([label, running], i) => ({
      id: `demo-${i}`,
      label,
      doing: running,
      status: i < completed ? 'completed' : i === completed && doing ? 'in_progress' : 'pending',
    }))
  if (arg === 'clear') return { progress: null, text: 'The progress bar is cleared.' }
  if (arg === 'ask')
    return {
      progress: { phase: 'asking', steps: demo(2, true) },
      cue: 'question',
      text: 'The progress bar is yellow: Claude is asking something (a test). /effortless progress clear removes it.',
    }
  if (arg === 'done')
    return {
      progress: { phase: 'done', steps: demo(5, false) },
      cue: 'done',
      text: 'The progress bar is green: every step is done (a test). /effortless progress clear removes it.',
    }
  return {
    progress: { phase: 'working', steps: demo(2, true) },
    text: 'A demo progress bar is showing, step 3 of 5 (a test). Try /effortless progress ask, progress done, progress clear.',
  }
}

/**
 * The hooks register.tsx does not have yet: the step list from the todo and task tools, Claude asking, and the start
 * of a turn the judge called big. `hidden` gives the parts switched off.
 */
export function registerProgress(on: On, hidden: () => readonly string[]) {
  const off = () => hidden().includes('progress')

  on('tool.call', async ($, e, next) => {
    if (off() || e.agentId !== undefined) return next(e)
    if (e.tool === 'AskUserQuestion') {
      const p = await read($, progressState)
      const shown = Boolean(p && (p.phase === 'working' || p.phase === 'paused') && p.steps.length >= MIN_STEPS)
      if (shown) {
        await update($, progressState, cur => (cur ? { ...cur, phase: 'asking' } : cur))
        queueCue(hidden(), 'question')
      }
      const result = await next(e)
      if (shown) await update($, progressState, cur => (cur?.phase === 'asking' ? { ...cur, phase: 'working' } : cur))
      return result
    }
    if (e.tool !== 'TodoWrite' && e.tool !== 'TaskCreate' && e.tool !== 'TaskUpdate') return next(e)
    const result = await next(e)
    if (('deny' in result && result.deny) || result.isError) return result
    if (e.tool === 'TodoWrite') {
      const steps = stepsFromTodos(e.todos)
      await update($, progressState, () => ({ phase: 'working', steps }))
    } else if (e.tool === 'TaskCreate') {
      const id = (result.result as { task?: { id?: string } } | undefined)?.task?.id
      if (id) await update($, progressState, p => ({ phase: 'working', steps: withTaskCreated(p && p.phase !== 'done' ? p.steps : [], id, e) }))
    } else {
      await update($, progressState, p => (p ? { phase: p.phase === 'planning' ? 'working' : p.phase, steps: withTaskUpdated(p.steps, e) } : p))
    }
    return result
  })

  // The judge called this turn a bigger one: the bar shows "Planning" until a step list comes.
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (!off() && !(await read($, progressState)) && isBigPick(await read($, pick))) {
      await update($, progressState, p => p ?? { phase: 'planning', steps: [] })
    }
    return result
  })
}

/** What drawing the bar takes besides the state: the surface's elements, the rows there is room for, the ✕. */
export type ProgressDraw = {
  // The surface's element table, as $.ui.resolve(e) gives it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Box: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Text: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: any
  /** The surface's Svg, on the surfaces that have one (not the terminal): the track is drawn as one still image. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Svg?: any
  maxRows: number
  onClose: () => unknown
}

/**
 * Whether the bar shows in this place: 'active' (planning, working, asking) sits above the alert bands, 'resting'
 * (done, paused) below them. A list too short, or one the person closed, shows nowhere.
 */
export function progressShows(p: Progress | null, hiddenKey: string | null, when: 'active' | 'resting'): p is Progress {
  if (!p) return false
  // A finished task comes before the alerts too: it is news, and it lasts only until the next message.
  const active = p.phase === 'planning' || p.phase === 'working' || p.phase === 'asking' || p.phase === 'done'
  if ((when === 'active') !== active) return false
  if (p.phase === 'planning') return true
  return p.steps.length >= MIN_STEPS && hiddenKey !== stepsKey(p.steps)
}

/**
 * The track as one image, for the surfaces that draw Svg: a rounded segment per step (filled when completed,
 * half filled when in progress, a faint groove when pending), past SEGMENTS_MAX one continuous fill, and a dot at the
 * finish. A row of characters cannot be clipped to a share of the row there, so it spilled into the title.
 */
export function progressTrackSvg(p: Progress): string {
  const look = LOOKS[p.phase]
  const id = p.phase
  const W = 1000
  const H = 16
  const end = 24
  const y = 4
  const h = 8
  const r = 4
  const n = (v: number) => v.toFixed(1)
  const finished = p.phase === 'done'
  // Filled segments glow softly; the current one has a light sweeping across it and a pulsing tip; a finished task
  // lights up its segments one after another and its finish dot pulses.
  const groove = (x: number, w: number) =>
    `<rect x="${n(x)}" y="${y}" width="${n(Math.max(0, w))}" height="${h}" rx="${r}" fill="#ffffff" fill-opacity=".08"/>`
  const lit = (x: number, w: number, order = -1) =>
    `<rect x="${n(x)}" y="${y}" width="${n(Math.max(0, w))}" height="${h}" rx="${r}" fill="url(#fill-${id})" filter="url(#glow-${id})"` +
    (finished && order >= 0 ? ` class="pop" style="animation-delay:${(order * 0.12).toFixed(2)}s"` : '') +
    '/>'
  const current = (x: number, w: number) =>
    `<clipPath id="clip-${id}"><rect x="${n(x)}" y="${y}" width="${n(w)}" height="${h}" rx="${r}"/></clipPath>` +
    `<rect clip-path="url(#clip-${id})" class="sweep" x="${n(x - 70)}" y="${y}" width="70" height="${h}" fill="url(#shine)"/>` +
    `<circle class="pulse" cx="${n(x + w)}" cy="8" r="5.5" fill="${look.color}"/>`
  const total = p.steps.length
  const room = W - end
  const parts: string[] = []
  if (total > 0 && total <= SEGMENTS_MAX) {
    const gap = 8
    const seg = (room - gap * (total - 1)) / total
    p.steps.forEach((step, i) => {
      const x = i * (seg + gap)
      parts.push(groove(x, seg))
      if (finished || step.status === 'completed') parts.push(lit(x, seg, i))
      else if (step.status === 'in_progress') parts.push(lit(x, seg / 2), current(x, seg / 2))
    })
  } else {
    const fill = room * (finished ? 1 : progressShare(p.steps))
    parts.push(groove(0, room), lit(0, fill, 0))
    if (!finished && fill > 0) parts.push(current(0, fill))
  }
  // The finish line: a small flag, a ticked circle once the task is done.
  const dot = finished
    ? `<g class="pulse"><circle cx="${W - 9}" cy="8" r="7" fill="${look.color}"/>` +
      `<path d="M${W - 12.5} 8.2L${W - 10} 10.6L${W - 5.6} 5.6" fill="none" stroke="${look.bg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`
    : `<path d="M${W - 15} 15V1.5" stroke="${look.color}" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M${W - 14.3} 2L${W - 3} 5L${W - 14.3} 8.4Z" fill="${look.color}" fill-opacity=".7"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    '<style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}' +
    '.sweep{animation:sweep 1.8s linear infinite}@keyframes sweep{to{transform:translateX(320px)}}' +
    '.pulse{transform-box:fill-box;transform-origin:center;opacity:.55;animation:pulse 1.6s ease-in-out infinite}' +
    '@keyframes pulse{50%{opacity:1;transform:scale(1.25)}}' +
    '.pop{opacity:0;animation:pop .45s ease-out forwards}@keyframes pop{to{opacity:1}}</style>' +
    `<defs><linearGradient id="fill-${id}" x1="0" x2="1"><stop offset="0" stop-color="${look.color}" stop-opacity=".6"/>` +
    `<stop offset="1" stop-color="${look.color}"/></linearGradient>` +
    '<linearGradient id="shine"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/>' +
    '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    `<filter id="glow-${id}" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="2.5" result="b"/>` +
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    parts.join('') + dot + '</svg>'
  )
}

/**
 * The art behind the right side of the band, in the band's colour, fading in from the left like the other bands:
 * sparkles twinkling while it works, question marks rising while it waits for an answer, checkmarks rising when it is
 * done. One source per state, so the frame is rebuilt only when the state changes.
 */
export function progressArtSvg(phase: Progress['phase']): string {
  const c = LOOKS[phase].color
  const spark = (x: number, y: number, s: number, delay: number) =>
    `<path class="sp" style="transform-origin:${x}px ${y}px;animation-delay:${delay}s" d="M${x} ${y - s}L${x + s * 0.28} ${y - s * 0.28}L${x + s} ${y}` +
    `L${x + s * 0.28} ${y + s * 0.28}L${x} ${y + s}L${x - s * 0.28} ${y + s * 0.28}L${x - s} ${y}L${x - s * 0.28} ${y - s * 0.28}Z" fill="#fff"/>`
  const check = (x: number, delay: number, dur: number) =>
    `<path class="up" style="animation-delay:${delay}s;animation-duration:${dur}s" d="M${x - 3} 31L${x - 1} 33.2L${x + 3.2} 28.6" ` +
    `fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`
  const ask = (x: number, delay: number, dur: number) =>
    `<text class="up" style="animation-delay:${delay}s;animation-duration:${dur}s" x="${x}" y="34" font-size="7" font-family="sans-serif" ` +
    `font-weight="700" fill="${c}">?</text>`
  const sparks = [
    [190, 8, 1.4, 0.3], [214, 22, 1.1, 2.1], [238, 6, 1.6, 1.2], [262, 19, 1, 3.4], [286, 9, 1.3, 0.9], [310, 24, 1.1, 2.7],
    [334, 7, 1.5, 1.8], [350, 17, 1, 0.1],
  ]
    .map(([x, y, s, d]) => spark(x!, y!, s!, d!))
    .join('')
  const rising =
    phase === 'done'
      ? [[200, 0, 3.2], [228, 1.1, 3.6], [256, 0.5, 3], [284, 1.8, 3.4], [312, 0.9, 3.1], [340, 2.3, 3.5]].map(([x, d, t]) => check(x!, d!, t!)).join('')
      : phase === 'asking'
        ? [[214, 0, 3.6], [262, 1.4, 4], [310, 0.7, 3.4], [346, 2.2, 3.8]].map(([x, d, t]) => ask(x!, d!, t!)).join('')
        : ''
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice">' +
    '<style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}' +
    '.sp{opacity:0;transform:scale(0);animation:tw 4.2s ease-in-out infinite}' +
    '@keyframes tw{0%,70%,100%{opacity:0;transform:scale(0) rotate(0)}82%{opacity:.85;transform:scale(1) rotate(30deg)}92%{opacity:0;transform:scale(.2) rotate(60deg)}}' +
    '.up{opacity:0;animation-name:up;animation-timing-function:ease-out;animation-iteration-count:infinite}' +
    '@keyframes up{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}100%{opacity:0;transform:translateY(-30px)}}' +
    '.br{animation:br 6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.8}50%{opacity:1}}</style>' +
    `<defs><linearGradient id="wash" x1="0" x2="1"><stop offset=".45" stop-color="${c}" stop-opacity="0"/>` +
    `<stop offset=".75" stop-color="${c}" stop-opacity=".12"/><stop offset="1" stop-color="${c}" stop-opacity=".3"/></linearGradient>` +
    '<linearGradient id="fade" x1="0" x2="1"><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient>' +
    '<mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask></defs>' +
    `<g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#wash)"/>${sparks}${rising}</g></svg>`
  )
}

/** The bar's first words: where the task is. */
export function progressTitle(p: Progress): string {
  const total = p.steps.length
  const at = stepNumber(p.steps)
  if (p.phase === 'planning') return 'Planning a bigger task'
  if (p.phase === 'done') return `Done · all ${total} steps`
  if (p.phase === 'asking') return `Waiting for your answer · step ${at} of ${total}`
  if (p.phase === 'paused') return `Paused at step ${at} of ${total}`
  return `Step ${at} of ${total}`
}

/**
 * The band: the brand surface (or yellow, or green), the title and the step on the first row, the track below it.
 * The track is an animated Svg where the surface has one, else a row of characters. Its frame is rebuilt when the
 * bar redraws, which happens only when a step or the state changes.
 */
export function drawProgress(p: Progress, d: ProgressDraw) {
  const { Box, Text, Button } = d
  const look = LOOKS[p.phase]
  const total = p.steps.length
  const step = currentStep(p.steps)
  const title = progressTitle(p)
  const words = p.phase === 'done' || p.phase === 'planning' ? '' : ((p.phase === 'paused' ? step?.label : step?.doing) ?? '')
  const name = (
    <Box key="progress-name" position="relative" flexShrink={0}>
      <Text color={look.color} bold>
        ✦ effortless
      </Text>
    </Box>
  )
  const closeButton = <Button key="progress-close" plain role="dismiss" label="✕" onPress={d.onClose} />
  // Short of room, or nothing to count yet: one row, the bar as ten blocks.
  if (d.maxRows < 4 || p.phase === 'planning') {
    const blocks = Math.round(progressShare(p.steps) * 10)
    return (
      <Box key="progress-bar" position="relative" flexDirection="row" gap={1} alignItems="center" paddingX={1} overflow="hidden"
        backgroundColor={look.bg} borderStyle="round" borderColor={look.edge}>
        {d.Svg ? (
          <Box key="progress-art" position="absolute" top={-1} right={0} bottom={-1}>
            <d.Svg key={`art-${p.phase}`} source={progressArtSvg(p.phase)} alt="" width={440} height={64} isInteractive />
          </Box>
        ) : null}
        {name}
        {p.phase === 'planning' ? null : (
          <Box key="progress-blocks" position="relative" flexShrink={0} flexDirection="row">
            <Text color={look.color}>{'▰'.repeat(blocks)}</Text>
            <Text dimColor>{'▱'.repeat(10 - blocks)}</Text>
          </Box>
        )}
        <Box key="progress-words" position="relative" flexShrink={1} minWidth={0}>
          <Text wrap="truncate">{words ? `${title} · ${words}` : title}</Text>
        </Box>
        <Box flexGrow={1} />
        {closeButton}
      </Box>
    )
  }
  const fill = (key: string, lit: boolean) => (
    <Box key={key} flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
      {lit ? <Text color={look.color}>{'━'.repeat(RUN)}</Text> : <Text dimColor>{'─'.repeat(RUN)}</Text>}
    </Box>
  )
  // One segment per step: completed full, in progress half, pending empty. Past SEGMENTS_MAX one continuous fill.
  const track =
    total <= SEGMENTS_MAX
      ? p.steps.map((s, i) =>
          s.status === 'in_progress' && p.phase !== 'done' ? (
            <Box key={`seg-${i}`} flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden" flexDirection="row">
              {fill(`seg-${i}-a`, true)}
              {fill(`seg-${i}-b`, false)}
            </Box>
          ) : (
            fill(`seg-${i}`, p.phase === 'done' || s.status === 'completed')
          ),
        )
      : [
          <Box key="seg-done" width={`${Math.round(progressShare(p.steps) * 100)}%`} height={1} overflow="hidden">
            <Text color={look.color}>{'━'.repeat(RUN * 2)}</Text>
          </Box>,
          fill('seg-rest', false),
        ]
  return (
    <Box key="progress-bar" position="relative" flexDirection="column" paddingX={1} overflow="hidden"
      backgroundColor={look.bg} borderStyle="round" borderColor={look.edge}>
      {d.Svg ? (
        <Box key="progress-art" position="absolute" top={-1} right={0} bottom={-1}>
          <d.Svg key={`art-${p.phase}`} source={progressArtSvg(p.phase)} alt="" width={440} height={64} isInteractive />
        </Box>
      ) : null}
      <Box key="progress-head" position="relative" flexDirection="row" gap={1} alignItems="center">
        {name}
        <Box key="progress-words" flexShrink={1} minWidth={0} flexDirection="row" gap={1}>
          <Text color={look.color} wrap="truncate">
            {title}
          </Text>
          {words ? <Text wrap="truncate">{words}</Text> : null}
        </Box>
        <Box flexGrow={1} />
        {closeButton}
      </Box>
      {d.Svg ? (
        <Box key="progress-track" position="relative" flexDirection="row">
          <d.Svg source={progressTrackSvg(p)} alt={title} isInteractive />
        </Box>
      ) : (
        <Box key="progress-track" flexDirection="row" gap={total <= SEGMENTS_MAX ? 1 : 0} alignItems="center">
          {track}
          <Box key="progress-flag" flexShrink={0}>
            <Text color={p.phase === 'done' ? look.color : undefined} dimColor={p.phase !== 'done'}>
              ⚑
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
