import type { AgentRec, AgentState, Progress } from '../types'
import { MARK_SVG } from './brand-mark'
import { ART_H, ART_W, LOOKS, PILL_H, progressArtSvg, progressShare, progressTrackSvg, THINK_W, thinkingSvg } from './progress'

// The agent panel (docs/agent-panel/): a pane on the right with this chat and the subagents it sends off. Its own file,
// like progress.tsx: the rules and the drawing live here, and what needs $ (the hooks, the state) is a short section in
// register.tsx, since the engine follows $ only into functions of the file that holds the hooks.
//
// Built from the bar's own parts, not new ones: the dashboard's card (mark, bold word, ring), the progress band's looks
// and art per phase for each agent (planning, working, asking, done), its live track for an agent's steps, the done
// card's green, the settings bar's big tilted mark, cut off by the corner.

/** The pane's id, for $.ui.open and its ui.render hook. */
export const AGENTS_PANE = 'effortless-agents'

/** The progress band's phase each agent state is drawn in: its colours and its art. */
const PHASE: Record<Exclude<AgentState, 'failed'>, Progress['phase']> = {
  picking: 'planning',
  running: 'working',
  waiting: 'asking',
  done: 'done',
}
/** The one state the progress band has no look for: a red card, as the alert bands' red. */
const FAILED = { color: '#e5534b', bg: '#1a0f0f', edge: '#6a2a26' }
const lookOf = (s: AgentState) => (s === 'failed' ? FAILED : LOOKS[PHASE[s]])

/** How the whole chat stands, worst news first: someone waits on a tool, someone works, all done, or nothing ran. */
export type Mood = 'waiting' | 'working' | 'done' | 'quiet'
export function moodOf(agents: readonly AgentRec[]): Mood {
  if (agents.some(a => a.state === 'waiting')) return 'waiting'
  if (agents.some(a => a.state === 'running' || a.state === 'picking')) return 'working'
  return agents.length ? 'done' : 'quiet'
}

/** The header's word for the mood, as the bar names its effort: one bold word. */
export function moodWord(agents: readonly AgentRec[]): string {
  const live = agents.filter(a => a.state === 'running' || a.state === 'picking').length
  const waiting = agents.filter(a => a.state === 'waiting').length
  if (waiting) return `${waiting} waiting`
  if (live) return `${live} working`
  return agents.length ? 'All done' : 'Quiet'
}

/** The share of the chat's agent work done, 0-100: finished agents count whole, the rest by their own steps. */
export function overallPercent(agents: readonly AgentRec[]): number {
  if (!agents.length) return 0
  const share = agents.map(a => (a.state === 'done' || a.state === 'failed' ? 1 : a.steps?.length ? progressShare(a.steps) : 0))
  return Math.round((share.reduce((s, v) => s + v, 0) / agents.length) * 100)
}

/** Minutes and seconds, as the cache clock shows them. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** How long one tool call runs before its agent counts as waiting on it (a test run, a build, a long fetch). */
export const WAIT_MS = 8000

/** The agents that have sat in one tool call past WAIT_MS turned to waiting; null when none changed. */
export function withWaits(agents: readonly AgentRec[], nowMs: number): AgentRec[] | null {
  let changed = false
  const next = agents.map(a => {
    if (a.state !== 'running' || a.toolSince === undefined || nowMs - a.toolSince < WAIT_MS) return a
    changed = true
    return { ...a, state: 'waiting' as const, waitingSince: a.toolSince }
  })
  return changed ? next : null
}

/** What an agent does now, in a few words: the tool and the one argument that says what it is about. */
export function toolLine(tool: string, input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const base = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
  const arg =
    tool === 'Bash' ? str('command')
    : tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit' ? base(str('file_path') || str('notebook_path'))
    : tool === 'Grep' || tool === 'Glob' ? str('pattern')
    : tool === 'WebFetch' ? str('url').replace(/^https?:\/\//, '')
    : tool === 'WebSearch' ? str('query')
    : tool === 'Agent' ? str('description')
    : ''
  const name = tool.startsWith('mcp__') ? tool.split('__').pop() ?? tool : tool
  const one = arg.split('\n')[0].trim()
  return one ? `${name} ${one.length > 60 ? `${one.slice(0, 59)}…` : one}` : name
}

/** The agents worth a card of their own: everything not finished. Finished ones fold into one green card. */
export function splitAgents(agents: readonly AgentRec[]): { live: AgentRec[]; done: AgentRec[] } {
  return { live: agents.filter(a => a.state !== 'done'), done: agents.filter(a => a.state === 'done') }
}

/** The mark, big, tilted and faint, as the settings bar shows it: cut off by the pane's bottom-right corner. */
const CORNER_MARK = MARK_SVG.replace('<g mask=', '<g opacity=".16" transform="rotate(9 50 50)" mask=')

/**
 * The pane's background, the bar's art made tall: the brand wash rising from the bottom-right corner in the mood's
 * colour, the bar's slanted light lines and its sparkles, under the band's grain. One source per mood, so a redraw in
 * the same mood is the same image.
 */
export function paneWashSvg(mood: Mood, w = 400, h = 900): string {
  const c = mood === 'waiting' ? LOOKS.asking.color : mood === 'done' ? LOOKS.done.color : '#8f7ff0'
  const light = mood === 'waiting' ? '#f2c97a' : mood === 'done' ? '#b4f0c8' : '#b3a6ff'
  const strength = mood === 'quiet' ? 0.45 : mood === 'waiting' ? 0.6 : 1
  const f = (v: number) => v.toFixed(1)
  // The bar's slanted lines, as BRAND_SVG draws them, stretched to the pane's height.
  const lines = [0, 1, 2, 3, 4, 5]
    .map(i => {
      const x = w * 0.18 + i * (w * 0.15)
      return `<line x1="${f(x)}" y1="${h + 10}" x2="${f(x + h * 0.36)}" y2="-10" stroke="#fff" stroke-opacity="${i % 2 ? 0.05 : 0.04}" stroke-width="${[3, 1.2, 4, 1.5, 3, 1.2][i]}"/>`
    })
    .join('')
  // The bar's sparkles: they pop, turn and go, each on its own beat; more of them while agents work.
  const count = mood === 'quiet' ? 8 : mood === 'done' ? 12 : 18
  const sparks = Array.from({ length: count }, (_, i) => {
    const a = Math.sin((i + 1) * 12.9898) * 43758.5453
    const b = Math.sin((i + 1) * 78.233) * 24634.6345
    const x = w * 0.15 + (a - Math.floor(a)) * w * 0.85
    const y = h * 0.3 + (b - Math.floor(b)) * h * 0.7
    const s = 1.6 + ((a * 7) % 1) * 1.8
    const d = `M${f(x)} ${f(y - s)}L${f(x + s * 0.21)} ${f(y - s * 0.21)}L${f(x + s)} ${f(y)}L${f(x + s * 0.21)} ${f(y + s * 0.21)}L${f(x)} ${f(y + s)}L${f(x - s * 0.21)} ${f(y + s * 0.21)}L${f(x - s)} ${f(y)}L${f(x - s * 0.21)} ${f(y - s * 0.21)}Z`
    return `<path class="sp" style="transform-origin:${f(x)}px ${f(y)}px;animation-duration:${(3.6 + (i % 5) * 0.45).toFixed(2)}s;animation-delay:${((i * 0.83) % 4.4).toFixed(2)}s" d="${d}"/>`
  }).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMaxYMax slice">` +
    '<style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}' +
    '.sp{fill:#fff;opacity:0;transform:scale(0);animation-name:gl;animation-timing-function:ease-in-out;animation-iteration-count:infinite}' +
    '@keyframes gl{0%,72%,100%{opacity:0;transform:scale(0) rotate(0deg)}82%{opacity:.9;transform:scale(1) rotate(30deg)}92%{opacity:0;transform:scale(.2) rotate(60deg)}}' +
    '.br{animation:br 6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.85}50%{opacity:1}}</style>' +
    `<defs><radialGradient id="bg" cx="${w}" cy="${h}" r="${f(h * 0.95)}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${light}" stop-opacity="${(0.42 * strength).toFixed(2)}"/>` +
    `<stop offset=".35" stop-color="${c}" stop-opacity="${(0.24 * strength).toFixed(2)}"/>` +
    `<stop offset=".75" stop-color="${c}" stop-opacity="${(0.06 * strength).toFixed(2)}"/>` +
    `<stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>` +
    '<linearGradient id="fade" x1="0" y1="0" x2="1" y2="1"><stop offset=".2" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff"/></linearGradient>' +
    `<mask id="m"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>` +
    '<pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".07"/></pattern></defs>' +
    `<rect class="br" width="${w}" height="${h}" fill="url(#bg)"/>` +
    `<g mask="url(#m)">${lines}${sparks}<rect width="${w}" height="${h}" fill="url(#grain)"/></g>` +
    '</svg>'
  )
}

/** What drawing the pane takes besides the agents: the elements, the bar's parts from register.tsx, the presses. */
export type AgentsDraw = {
  // The surface's element table, as $.ui.resolve(e) gives it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Box: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Text: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Svg?: any
  /** Rows of the pane's body, so the background fills it. */
  rows: number
  nowMs: number
  /** The chat's own title for the header. */
  title: string
  /** The opened card: an agent's id, 'done' for the finished ones, or null. */
  open: string | null
  /** The bar's parts: its context ring, its card art (DASH_SVG) and its size. */
  ringSvg: (percent: number, color: string) => string
  cardArt: { source: string; width: number; height: number }
  onOpen: (id: string) => unknown
}

const TEXT = '#d4d4d8'
const DIM = '#8b8b93'
const CARD_BG = '#141416'
const CARD_EDGE = '#2a2a2f'

/** The header: the dashboard's card, saying how the chat's agents stand. Mark, one bold word, the ring and its share. */
function header(d: AgentsDraw, agents: readonly AgentRec[]) {
  const { Box, Text, Svg } = d
  const mood = moodOf(agents)
  const color = mood === 'waiting' ? LOOKS.asking.color : mood === 'done' ? LOOKS.done.color : TEXT
  const pct = overallPercent(agents)
  return (
    <Box key="agents-head" position="relative" flexDirection="row" alignItems="center" paddingX={1} overflow="hidden"
      backgroundColor={CARD_BG} borderStyle="round" borderColor={CARD_EDGE}>
      {Svg ? (
        <Box key="agents-head-art" position="absolute" top={-1} right={0} bottom={-1}>
          <Svg source={d.cardArt.source} alt="effortless" width={d.cardArt.width} height={d.cardArt.height} />
        </Box>
      ) : null}
      <Box position="relative" flexDirection="row" alignItems="center" flexGrow={1} minWidth={0}>
        <Box position="absolute" top={0} left={0} />
        {Svg ? (
          <Box flexShrink={0} marginRight={1} alignItems="center">
            <Svg source={MARK_SVG} alt="effortless" width={18} height={18} />
          </Box>
        ) : <Text color="#a79cf7" bold>✦ </Text>}
        <Text color={color} bold>{moodWord(agents)}</Text>
        {Svg && agents.length ? (
          <Box flexShrink={0} marginLeft={2} flexDirection="row" gap={1} alignItems="center">
            <Svg source={d.ringSvg(pct, color)} alt={`${pct}% done`} width={16} height={16} />
            <Text color={TEXT}>{`${pct}%`}</Text>
          </Box>
        ) : null}
        <Box flexGrow={1} flexShrink={1} minWidth={0} marginLeft={2} overflow="hidden">
          <Text dimColor wrap="truncate">{agents.length ? `${agents.length} agent${agents.length > 1 ? 's' : ''}` : d.title}</Text>
        </Box>
      </Box>
    </Box>
  )
}

/** The line under an agent's name: its live track when it keeps a list, else what it does now, else its time. */
function agentLine(d: AgentsDraw, a: AgentRec) {
  const { Box, Text, Svg } = d
  const look = lookOf(a.state)
  if (a.state === 'picking')
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {Svg ? <Svg source={thinkingSvg('planning')} alt="picking" width={THINK_W} height={PILL_H} /> : null}
        <Text color={look.color}>picking a model</Text>
      </Box>
    )
  if (a.state === 'waiting')
    return <Text color={look.color} wrap="truncate">{`waiting on ${a.now ?? 'a tool'}`}</Text>
  if (a.state === 'failed') return <Text color={look.color}>{`failed after ${clockText((a.endedAt ?? d.nowMs) - a.startedAt)}`}</Text>
  if (Svg && a.steps && a.steps.length > 1)
    return <Svg source={progressTrackSvg({ phase: 'working', steps: a.steps })} alt={`${a.steps.filter(s => s.status === 'completed').length} of ${a.steps.length}`} width={1000} height={24} />
  return <Text dimColor wrap="truncate">{a.now ?? 'starting'}</Text>
}

/** One agent: a small progress band in its state's look and art. Its name in the look's colour, the task dim, its time. */
function agentCard(d: AgentsDraw, a: AgentRec) {
  const { Box, Text, Button, Svg } = d
  const look = lookOf(a.state)
  const phase = a.state === 'failed' ? null : PHASE[a.state]
  const isOpen = d.open === a.id
  return (
    <Box key={`agent-${a.id}`} position="relative" flexDirection="column" paddingX={1} overflow="hidden"
      backgroundColor={look.bg} borderStyle="round" borderColor={look.edge}>
      {Svg && phase ? (
        <Box key={`agent-${a.id}-art`} position="absolute" top={0} left={0} right={0} bottom={0}>
          <Svg source={cardArtSvg(phase)} alt="" width={ART_W} height={CARD_ART_H} />
        </Box>
      ) : null}
      <Box position="relative" flexDirection="column">
        <Box position="absolute" top={0} left={0} />
        <Box flexDirection="row">
          <Text color={look.color} bold>{a.parentId ? `└ ${a.type}` : a.type}</Text>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Text color={TEXT} wrap="truncate">{`  ${a.task}`}</Text>
          </Box>
          {a.endedAt ? <Text color={DIM}>{`  ${clockText(a.endedAt - a.startedAt)}`}</Text> : null}
        </Box>
        {agentLine(d, a)}
        {isOpen ? (
          <Box flexDirection="column" marginTop={1}>
            {a.model ? (
              <Box flexDirection="row">
                <Text color={look.color} bold>{a.effort ? `${a.model} ${a.effort}` : a.model}</Text>
                {a.why ? <Text dimColor wrap="truncate">{`  ${a.why}`}</Text> : null}
              </Box>
            ) : null}
            {a.now && a.state !== 'waiting' ? <Text dimColor wrap="truncate">{a.now}</Text> : null}
          </Box>
        ) : null}
      </Box>
      {/* The whole card takes the press: a blank button in a layer over it, as the settings cards do. */}
      <Box position="absolute" top={0} left={0} right={0} bottom={0}>
        <Button key={`agent-${a.id}-press`} plain label={' '.repeat(60)} hover={{ backgroundColor: '#00000000' }} onPress={() => d.onOpen(a.id)} />
      </Box>
    </Box>
  )
}

/** A card's height in px, for its art: two lines and the borders, with room to spare. */
const CARD_ART_H = ART_H
/** The progress band's art for a phase, filling a card: sliced to the card's height rather than drawn as a strip. */
const cardArtCache = new Map<string, string>()
export function cardArtSvg(phase: Progress['phase']): string {
  let svg = cardArtCache.get(phase)
  if (!svg) {
    svg = progressArtSvg(phase).replace(
      `width="${ART_W}" height="${ART_H}" viewBox="0 0 ${ART_W} ${ART_H}">`,
      `width="${ART_W}" height="${CARD_ART_H}" viewBox="0 0 ${ART_W} ${ART_H}" preserveAspectRatio="xMinYMin slice">`,
    )
    cardArtCache.set(phase, svg)
  }
  return svg
}

/** The finished agents, folded into one green card: the done band's look. Opens to list them. */
function doneCard(d: AgentsDraw, done: readonly AgentRec[]) {
  const { Box, Text, Button, Svg } = d
  const look = LOOKS.done
  const isOpen = d.open === 'done'
  return (
    <Box key="agents-done" position="relative" flexDirection="column" paddingX={1} overflow="hidden"
      backgroundColor={look.bg} borderStyle="round" borderColor={look.edge}>
      {Svg ? (
        <Box position="absolute" top={0} left={0} right={0} bottom={0}>
          <Svg source={cardArtSvg('done')} alt="" width={ART_W} height={CARD_ART_H} />
        </Box>
      ) : null}
      <Box position="relative" flexDirection="column">
        <Box position="absolute" top={0} left={0} />
        <Box flexDirection="row">
          <Text color={look.color} bold>{`✓ ${done.length} done`}</Text>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Text dimColor wrap="truncate">  reported back</Text>
          </Box>
        </Box>
        {isOpen
          ? done.map(a => (
              <Box key={`done-${a.id}`} flexDirection="row">
                <Text color={TEXT}>{a.parentId ? `└ ${a.type}` : a.type}</Text>
                <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                  <Text dimColor wrap="truncate">{`  ${a.task}`}</Text>
                </Box>
                <Text color={DIM}>{`  ${clockText((a.endedAt ?? d.nowMs) - a.startedAt)}`}</Text>
              </Box>
            ))
          : null}
      </Box>
      <Box position="absolute" top={0} left={0} right={0} bottom={0}>
        <Button key="agents-done-press" plain label={' '.repeat(60)} hover={{ backgroundColor: '#00000000' }} onPress={() => d.onOpen('done')} />
      </Box>
    </Box>
  )
}

/**
 * The whole pane: the mood's wash and the corner mark behind, the header, a card per agent still going, the finished
 * ones folded into one. Nothing else unless pressed open.
 */
export function agentsPane(d: AgentsDraw, agents: readonly AgentRec[]) {
  const { Box, Text, Svg } = d
  const { live, done } = splitAgents(agents)
  const mood = moodOf(agents)
  // One row of the desktop pane is about 19 px; the background is drawn a little taller than the body.
  const tall = Math.max(240, (d.rows + 2) * 19)
  return (
    <Box key="agents" position="relative" flexDirection="column" height={d.rows} overflow="hidden">
      {Svg ? (
        <Box key="agents-wash" position="absolute" top={0} left={0} right={0} bottom={0}>
          <Svg source={paneWashSvg(mood, 400, tall)} alt="" width={400} height={tall} />
        </Box>
      ) : null}
      {Svg ? (
        <Box key="agents-mark" position="absolute" right={-7} bottom={-4}>
          <Svg source={CORNER_MARK} alt="" width={230} height={230} />
        </Box>
      ) : null}
      <Box position="relative" flexDirection="column" gap={1}>
        <Box position="absolute" top={0} left={0} />
        {header(d, agents)}
        {live.map(a => agentCard(d, a))}
        {done.length ? doneCard(d, done) : null}
        {!agents.length ? <Text dimColor>  Agents show here when Claude sends some off.</Text> : null}
      </Box>
    </Box>
  )
}

/** Sample agents for `/effortless agents demo`: one of each state, so the pane can be seen without a real run. */
export function demoAgents(nowMs: number): AgentRec[] {
  const step = (label: string, status: 'completed' | 'in_progress' | 'pending', i: number) => ({ id: `s${i}`, label, doing: label, status })
  return [
    { id: 'demo-1', type: 'Explore', task: 'find the pane and agent hooks', state: 'running', startedAt: nowMs - 103_000, model: 'Haiku', effort: 'Low', why: 'read-only search, wide but shallow',
      now: 'Grep "agentId" in hooks/', steps: [step('List hooks', 'completed', 0), step('Read types', 'completed', 1), step('Find spawn', 'in_progress', 2), step('Report', 'pending', 3)] },
    { id: 'demo-2', type: 'code-reviewer', task: 'review the agent-panel branch', state: 'waiting', startedAt: nowMs - 251_000, waitingSince: nowMs - 38_000, now: 'Bash npm test', model: 'Opus', effort: 'High', why: 'a review before merge: misses cost more' },
    { id: 'demo-3', type: 'Plan', task: 'outline the release notes', state: 'picking', startedAt: nowMs - 2_000 },
    { id: 'demo-4', type: 'general-purpose', task: 'add state for the panel', state: 'done', startedAt: nowMs - 400_000, endedAt: nowMs - 208_000, model: 'Sonnet', effort: 'Medium' },
    { id: 'demo-5', parentId: 'demo-4', type: 'Explore', task: 'read the tests', state: 'done', startedAt: nowMs - 380_000, endedAt: nowMs - 340_000, model: 'Haiku', effort: 'Low' },
  ]
}
