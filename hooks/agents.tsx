import type { AgentNote, AgentRec, AgentsCam, AgentState, FileTouch, Progress, ProgressStep } from '../types'
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

// --- The map: the parts of the code this chat touched, and how they import each other ---------------------------------

/** The file a tool call reads or changes, and whether it changes it; null for a call that touches no one file. */
export function touchOf(tool: string, input: Record<string, unknown>): { path: string; edited: boolean } | null {
  const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  if (!path) return null
  if (tool === 'Read') return { path, edited: false }
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') return { path, edited: true }
  return null
}

/** A path relative to the project root, with forward slashes; null when it lies outside the root. */
export function relPath(path: string, root: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const p = norm(path)
  const r = norm(root)
  if (!/^([a-zA-Z]:)?\//.test(p)) return p.replace(/^\.\//, '')
  if (p.toLowerCase() === r.toLowerCase()) return null
  return p.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? p.slice(r.length + 1) : null
}

/** A path without its extension (and without a trailing /index): what an import names. */
export function stemOf(path: string): string {
  return path.replace(/\.(d\.ts|tsx?|jsx?|mjs|cjs|py)$/, '').replace(/\/index$/, '')
}

/** Joins a relative import onto the importing file's folder. */
function joinRel(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1)
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

/** The project files a source file imports, as stems relative to the root: relative JS/TS imports, Python modules. */
export function importsOf(path: string, text: string): string[] {
  const out = new Set<string>()
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) {
    const re = /(?:from\s*|import\s*\(?\s*|require\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g
    for (const m of text.matchAll(re)) out.add(stemOf(joinRel(path, m[1])))
  } else if (/\.py$/.test(path)) {
    for (const m of text.matchAll(/^\s*from\s+(\.*)([\w.]*)\s+import/gm)) {
      const dots = m[1].length
      const mod = m[2].replace(/\./g, '/')
      if (dots) out.add(joinRel(path, `${'../'.repeat(dots - 1)}./${mod}`))
      else if (mod) out.add(mod)
    }
    for (const m of text.matchAll(/^\s*import\s+([\w.]+)/gm)) out.add(m[1].replace(/\./g, '/'))
  }
  out.delete(stemOf(path))
  return [...out]
}

/** The module a file belongs to: its folder, at most two levels deep; files at the root are "project". */
export function moduleOf(path: string): string {
  const dirs = path.split('/').slice(0, -1)
  return dirs.length ? dirs.slice(0, 2).join('/') : 'project'
}

export type Module = { key: string; files: FileTouch[]; edited: boolean; live: AgentRec[] }

/** The modules the chat touched, most touched first, with the agents working in each right now. */
export function modulesOf(files: readonly FileTouch[], agents: readonly AgentRec[]): Module[] {
  const map = new Map<string, Module>()
  for (const f of files) {
    const key = moduleOf(f.path)
    const m = map.get(key) ?? { key, files: [], edited: false, live: [] }
    m.files.push(f)
    m.edited ||= f.edited
    map.set(key, m)
  }
  for (const a of agents) if (a.file && (a.state === 'running' || a.state === 'waiting')) map.get(moduleOf(a.file))?.live.push(a)
  return [...map.values()].sort((x, y) => y.files.length - x.files.length || x.key.localeCompare(y.key))
}

/** Which modules import which, as "from>to" pairs, among the files the chat touched. */
export function moduleLinks(files: readonly FileTouch[]): string[] {
  const byStem = new Map(files.map(f => [stemOf(f.path), f.path]))
  const links = new Set<string>()
  for (const f of files)
    for (const stem of f.imports) {
      const to = byStem.get(stem)
      if (to && moduleOf(to) !== moduleOf(f.path)) links.add(`${moduleOf(f.path)}>${moduleOf(to)}`)
    }
  return [...links]
}

/** The file list with one more touch: who, read or changed, and its imports once they are known. */
export function withTouch(files: readonly FileTouch[], path: string, edited: boolean, by: string, nowMs: number, imports?: string[]): FileTouch[] {
  const old = files.find(f => f.path === path)
  const next: FileTouch = {
    path,
    edited: edited || Boolean(old?.edited),
    by: old ? (old.by.includes(by) ? old.by : [...old.by, by]) : [by],
    lastAt: nowMs,
    imports: imports ?? old?.imports ?? [],
  }
  return [...files.filter(f => f.path !== path), next].slice(-80)
}

const MAP_W = 400
const MAP_H = 190
/**
 * The map: each module a node on a ring, sized by the files touched in it; a line wherever one imports another.
 * Changed modules are solid, read ones an outline; where an agent works now the node glows violet and light runs along
 * its links. In the bar's look: its dot grid, its violet, its breathing glow.
 */
export function mapSvg(modules: readonly Module[], links: readonly string[]): string {
  const f = (v: number) => v.toFixed(1)
  const shown = modules.slice(0, 10)
  const cx = MAP_W / 2
  const cy = MAP_H / 2
  const pos = new Map<string, { x: number; y: number; r: number }>()
  shown.forEach((m, i) => {
    const n = shown.length
    const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2
    const ring = n === 1 ? 0 : 1
    pos.set(m.key, { x: cx + Math.cos(a) * 150 * ring, y: cy + Math.sin(a) * 62 * ring, r: 4 + Math.min(7, Math.sqrt(m.files.length) * 2.6) })
  })
  const live = new Set(shown.filter(m => m.live.length).map(m => m.key))
  const edges = links
    .map(l => l.split('>'))
    .filter(([a, b]) => pos.has(a) && pos.has(b))
    .map(([a, b]) => {
      const p = pos.get(a)!
      const q = pos.get(b)!
      const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.15
      const my = (p.y + q.y) / 2 - (q.x - p.x) * 0.15
      const hot = live.has(a) || live.has(b)
      return `<path d="M${f(p.x)} ${f(p.y)} Q${f(mx)} ${f(my)} ${f(q.x)} ${f(q.y)}" fill="none" stroke="${hot ? '#a79cf7' : '#4a3f80'}" stroke-opacity="${hot ? 0.9 : 0.7}" stroke-width="1.2"${hot ? ' stroke-dasharray="3 5" class="fl"' : ''}/>`
    })
    .join('')
  const nodes = shown
    .map(m => {
      const p = pos.get(m.key)!
      const isLive = live.has(m.key)
      const name = m.key.split('/').pop() ?? m.key
      const halo = isLive ? `<circle class="br" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r + 9)}" fill="url(#halo)"/>` : ''
      const body = m.edited
        ? `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="${isLive ? '#a79cf7' : '#d4d4d8'}"/>`
        : `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="#15121f" stroke="${isLive ? '#a79cf7' : '#8b8b93'}" stroke-width="1.4"/>`
      const label = `<text x="${f(p.x)}" y="${f(p.y + p.r + 13)}" text-anchor="middle" class="${isLive ? 'tl' : 't'}">${name}</text>`
      return halo + body + label
    })
    .join('')
  const dots: string[] = []
  for (let y = 6; y < MAP_H; y += 12) for (let x = 6; x < MAP_W; x += 12) dots.push(`<circle cx="${x}" cy="${y}" r=".6"/>`)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">` +
    '<style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}' +
    ".t{font:11px system-ui,'Segoe UI',sans-serif;fill:#8b8b93}.tl{font:600 11px system-ui,'Segoe UI',sans-serif;fill:#ececf0}" +
    '.fl{animation:fl 1s linear infinite}@keyframes fl{to{stroke-dashoffset:-8}}' +
    '.br{animation:br 2.4s ease-in-out infinite}@keyframes br{0%,100%{opacity:.5}50%{opacity:1}}</style>' +
    '<defs><radialGradient id="halo"><stop offset="0" stop-color="#a79cf7" stop-opacity=".55"/><stop offset="1" stop-color="#a79cf7" stop-opacity="0"/></radialGradient></defs>' +
    `<g fill="#ffffff" fill-opacity=".06">${dots.join('')}</g>${edges}${nodes}</svg>`
  )
}

/** The map card: the picture, then a row per module that opens to its files. */
function mapCard(d: AgentsDraw, modules: readonly Module[], links: readonly string[]) {
  const { Box, Text, Button, Svg } = d
  return (
    <Box key="agents-map" position="relative" flexDirection="column" paddingX={1} backgroundColor={CARD_BG} borderStyle="round" borderColor={CARD_EDGE}>
      <Box flexDirection="row">
        <Text color={TEXT} bold>Map</Text>
        <Box flexGrow={1} />
        <Text dimColor>{`${modules.length} part${modules.length === 1 ? '' : 's'} touched`}</Text>
      </Box>
      {Svg ? <Svg source={mapSvg(modules, links)} alt={`map of ${modules.length} parts of the code`} width={MAP_W} height={MAP_H} /> : null}
      {modules.map(m => {
        const isOpen = d.module === m.key
        const lead = m.live.length ? m.live.map(a => a.type).join(', ') : m.edited ? 'changed' : 'read'
        return (
          <Box key={`mod-${m.key}`} position="relative" flexDirection="column">
            <Box flexDirection="row">
              <Text color={m.live.length ? ACCENT : DIM}>{isOpen ? '▾ ' : '▸ '}</Text>
              <Text color={TEXT} bold={m.live.length > 0}>{m.key}</Text>
              <Text dimColor>{`  ${m.files.length}`}</Text>
              <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" />
              <Text color={m.live.length ? ACCENT : DIM}>{lead}</Text>
            </Box>
            {isOpen
              ? m.files.map(file => {
                  const worker = m.live.find(a => a.file === file.path)
                  return (
                    <Box key={`file-${file.path}`} flexDirection="row" paddingLeft={2}>
                      <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                        <Text color={worker ? '#ececf0' : TEXT} wrap="truncate">{file.path.split('/').pop()}</Text>
                      </Box>
                      <Text color={worker ? ACCENT : DIM}>{worker ? `  ${worker.type}` : file.edited ? '  changed' : '  read'}</Text>
                    </Box>
                  )
                })
              : null}
            <Box position="absolute" top={0} left={0} right={0} height={1}>
              <Button key={`mod-${m.key}-press`} plain label={' '.repeat(60)} hover={{ backgroundColor: '#00000000' }} onPress={() => d.onModule(m.key)} />
            </Box>
          </Box>
        )
      })}
    </Box>
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Input?: any
  /** Rows and columns of the pane's body, so the ground fills it and the map fits it. */
  rows: number
  cols: number
  nowMs: number
  /** The node in focus: 'main' for this chat, an agent's id. It sets the progress on top. */
  focus: string | null
  onFocus: (id: string) => unknown
  /** The overview's camera, and its controls. */
  cam: AgentsCam | null
  onZoom: (factor: number) => unknown
  onFit: () => unknown
  /** The Client that takes the map's pointer (drag, click, wheel), where the surface draws one; null elsewhere. */
  mapClient: unknown
  /** The main chat's own task list, for its progress; null when it keeps none. */
  steps: readonly ProgressStep[] | null
  /** Whether Done is unfolded. */
  doneOpen: boolean
  onDone: () => unknown
  /** The main chat's weighted tokens, for the usage card. */
  mainCost: number
  /** Notes sent to every agent, and sending one. */
  notes: readonly AgentNote[]
  onNote: (text: string) => unknown
  /** The wordmark image (the settings bar's SETTINGS_TITLE). */
  wordmark: string
  /** Kept for the older cards still in this file. */
  open?: string | null
  onOpen?: (id: string) => unknown
  ringSvg?: (percent: number, color: string) => string
  cardArt?: { source: string; width: number; height: number }
  files?: readonly FileTouch[]
  module?: string | null
  onModule?: (key: string) => unknown
  title?: string
}

const TEXT = '#d4d4d8'
const ACCENT = '#a79cf7'
/** The pane's ground: the dashboard's dark, not the brand violet; the violet is kept for the wordmark and the accents. */
const PANE_BG = '#0f0f11'
const DIM = '#8b8b93'
const CARD_BG = '#141416'
const CARD_EDGE = '#2a2a2f'

/** The header: the dashboard's card, saying how the chat's agents stand. Mark, one bold word, the ring and its share. */
function header(d: AgentsDraw, agents: readonly AgentRec[]) {
  const { Box, Text, Svg } = d
  const mood = moodOf(agents)
  const color = mood === 'waiting' ? LOOKS.asking.color : mood === 'done' ? LOOKS.done.color : TEXT
  const pct = d.steps && d.steps.length > 1 ? Math.round(progressShare(d.steps) * 100) : overallPercent(agents)
  return (
    <Box key="agents-head" position="relative" flexDirection="column" paddingX={1} overflow="hidden"
      backgroundColor={CARD_BG} borderStyle="round" borderColor={CARD_EDGE}>
      {Svg ? (
        <Box key="agents-head-art" position="absolute" top={-1} right={0} bottom={-1}>
          <Svg source={d.cardArt.source} alt="effortless" width={d.cardArt.width} height={d.cardArt.height} />
        </Box>
      ) : null}
      <Box position="relative" flexDirection="row" alignItems="center" minWidth={0}>
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
      {Svg && d.steps && d.steps.length > 1 ? (
        <Box position="relative" flexDirection="column">
          <Box position="absolute" top={0} left={0} />
          <Svg source={progressTrackSvg({ phase: mood === 'done' ? 'done' : 'working', steps: [...d.steps] })}
            alt={`${d.steps.filter(s => s.status === 'completed').length} of ${d.steps.length} steps`} width={1000} height={24} />
        </Box>
      ) : null}
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
          <Svg source={cardArtSvg(phase)} alt={`${a.type} ${a.state}`} width={ART_W} height={CARD_ART_H} />
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
          <Svg source={cardArtSvg('done')} alt="finished agents" width={ART_W} height={CARD_ART_H} />
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

// --- The network: this chat and its agents as nodes, each linked to the one that sent it off --------------------------

/** One cell of the desktop pane in CSS px: a column (1ch of its font) and a row (its line). Nodes sit on cells, so the
 * blank button laid over each lands on it. */
/** A cell of the desktop pane in pixels: what turns the map's pixels into a Box's columns and rows. */
const CELL_W = 7.9
const CELL_H = 19

export type NetNode = { id: string; x: number; y: number; agent?: AgentRec }

/**
 * Where each node sits in the overview's world, in pixels around this chat at 0,0: the agents it sent off on a ring
 * that grows with their number, starting at the top; the agents they sent off further out, either side of their parent.
 */
export function worldLayout(agents: readonly AgentRec[]): NetNode[] {
  const ids = new Set(agents.map(a => a.id))
  const first = agents.filter(a => !a.parentId || !ids.has(a.parentId))
  const rest = agents.filter(a => a.parentId && ids.has(a.parentId))
  const r1 = Math.max(110, first.length * 26)
  const nodes: NetNode[] = [{ id: 'main', x: 0, y: 0 }]
  const placed = new Map<string, { t: number; r: number }>()
  first.forEach((a, i) => {
    const t = -Math.PI / 2 + (i / first.length) * Math.PI * 2
    placed.set(a.id, { t, r: r1 })
    nodes.push({ id: a.id, agent: a, x: Math.cos(t) * r1, y: Math.sin(t) * r1 * 0.8 })
  })
  const kids = new Map<string, AgentRec[]>()
  for (const a of rest) kids.set(a.parentId!, [...(kids.get(a.parentId!) ?? []), a])
  let pending = [...kids.entries()]
  while (pending.length) {
    const next: [string, AgentRec[]][] = []
    for (const [parent, list] of pending) {
      const at = placed.get(parent)
      if (!at) { next.push([parent, list]); continue }
      list.forEach((a, j) => {
        const t = at.t + (j - (list.length - 1) / 2) * 0.42
        const r = at.r + 100
        placed.set(a.id, { t, r })
        nodes.push({ id: a.id, agent: a, x: Math.cos(t) * r, y: Math.sin(t) * r * 0.8 })
      })
    }
    if (next.length === pending.length) break
    pending = next
  }
  return nodes
}

/** How long a glide of the overview takes, in ms. */
export const CAM_MS = 560
const ZOOM_MIN = 0.45
const ZOOM_MAX = 2.4
/** The overview before anyone moves it: this chat in the middle. */
export const CAM_HOME: AgentsCam = { x: 0, y: 0, z: 1, fx: 0, fy: 0, fz: 1, at: 0 }

/** Where the camera is at `nowMs`, partway through its glide: eased out, as the SVG's keySplines below. */
export function camNow(c: AgentsCam | null, nowMs: number): { x: number; y: number; z: number } {
  const cam = c ?? CAM_HOME
  const t = Math.max(0, Math.min(1, (nowMs - cam.at) / CAM_MS))
  const e = 1 - (1 - t) ** 3
  return { x: cam.fx + (cam.x - cam.fx) * e, y: cam.fy + (cam.y - cam.fy) * e, z: cam.fz + (cam.z - cam.fz) * e }
}

/** A glide from wherever the camera is now to `to` (any of x, y, z), starting now. */
export function camGlide(c: AgentsCam | null, nowMs: number, to: { x?: number; y?: number; z?: number }): AgentsCam {
  const from = camNow(c, nowMs)
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, to.z ?? from.z))
  return { x: to.x ?? from.x, y: to.y ?? from.y, z, fx: from.x, fy: from.y, fz: from.z, at: nowMs }
}

/** The camera put somewhere at once, no glide: what a drag does. */
export function camSet(x: number, y: number, z: number): AgentsCam {
  return { x, y, z, fx: x, fy: y, fz: z, at: 0 }
}

/** The camera that shows every node with a margin, this chat's ring centred. */
export function camFit(nodes: readonly NetNode[], w: number, h: number, nowMs: number, c: AgentsCam | null): AgentsCam {
  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)
  const [x0, x1, y0, y1] = [Math.min(...xs) - 50, Math.max(...xs) + 50, Math.min(...ys) - 40, Math.max(...ys) + 50]
  const z = Math.min(1.4, w / (x1 - x0), h / (y1 - y0))
  return camGlide(c, nowMs, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z })
}

/** The overview's size in pixels for a pane body of `cols` by `rows` cells: the card's border and padding taken off. */
export function mapSize(cols: number, rows: number): { w: number; h: number; cols: number; rows: number } {
  const c = Math.max(24, cols - 6)
  const r = Math.max(10, Math.min(17, Math.round(rows * 0.4)))
  return { w: Math.round(c * CELL_W), h: r * CELL_H, cols: c, rows: r }
}

/** The node under a point of the map, given as shares of its width and height (a click on the Client), or null. */
export function nodeAt(nodes: readonly NetNode[], c: AgentsCam | null, w: number, h: number, sx: number, sy: number, nowMs: number): string | null {
  const cam = camNow(c, nowMs)
  let best: string | null = null
  let bestD = 26
  for (const n of nodes) {
    const px = w / 2 + (n.x - cam.x) * cam.z
    const py = h / 2 + (n.y - cam.y) * cam.z
    const dist = Math.hypot(px - sx * w, py - sy * h)
    if (dist < bestD) { best = n.id; bestD = dist }
  }
  return best
}

const STATE_COLOR: Record<AgentState, string> = {
  picking: '#a79cf7',
  running: '#a79cf7',
  waiting: '#e0a33a',
  done: '#7fe0a4',
  failed: '#e5534b',
}

/** An agent's share done, for its ring and the bar at the top: its own steps, or its state. */
export function agentShare(a: AgentRec): number {
  if (a.state === 'done' || a.state === 'failed') return 1
  return a.steps?.length ? progressShare(a.steps) : a.state === 'picking' ? 0.02 : 0.08
}

/**
 * The overview as one image: the nodes in their world, seen through the camera. A camera that moved within CAM_MS
 * glides there (SMIL, started as far in as the time since), so a click on a node slides it into the middle.
 */
export function mapSvg(nodes: readonly NetNode[], w: number, h: number, c: AgentsCam | null, nowMs: number, focus: string, mainShare: number): string {
  const cam = c ?? CAM_HOME
  const f = (v: number) => v.toFixed(1)
  const since = nowMs - cam.at
  const glide = since >= 0 && since < CAM_MS
  const spline = `dur="${CAM_MS}ms" begin="${glide ? -since : 0}ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".33 1 .68 1"`
  const scale = glide && cam.fz !== cam.z ? `<animateTransform attributeName="transform" type="scale" from="${cam.fz}" to="${cam.z}" ${spline}/>` : ''
  const move = glide && (cam.fx !== cam.x || cam.fy !== cam.y)
    ? `<animateTransform attributeName="transform" type="translate" from="${f(-cam.fx)} ${f(-cam.fy)}" to="${f(-cam.x)} ${f(-cam.y)}" ${spline}/>`
    : ''
  const byId = new Map(nodes.map(n => [n.id, n]))
  const links = nodes
    .filter(n => n.agent)
    .map(n => {
      const a = n.agent!
      const from = byId.get(a.parentId && byId.has(a.parentId) ? a.parentId : 'main')!
      const len = Math.hypot(n.x - from.x, n.y - from.y) || 1
      const r0 = from.id === 'main' ? 24 : 14
      const ux = (n.x - from.x) / len
      const uy = (n.y - from.y) / len
      const d = `M${f(from.x + ux * r0)} ${f(from.y + uy * r0)} L${f(n.x - ux * 14)} ${f(n.y - uy * 14)}`
      const col = STATE_COLOR[a.state]
      if (a.state === 'done') return `<path d="${d}" stroke="${col}" stroke-opacity=".4" stroke-width="1.4"/>`
      if (a.state === 'failed') return `<path d="${d}" stroke="${col}" stroke-opacity=".5" stroke-width="1.2" stroke-dasharray="2 4"/>`
      return `<path d="${d}" stroke="${col}" stroke-opacity=".22" stroke-width="1.4"/><path class="fl" d="${d}" stroke="${col}" stroke-width="1.6" stroke-dasharray="4 10" stroke-linecap="round"/>`
    })
    .join('')
  const ring = (x: number, y: number, r: number, share: number, color: string, cls = '') => {
    const len = 2 * Math.PI * r
    return (
      `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" stroke="#ffffff" stroke-opacity=".1" stroke-width="2.4"/>` +
      `<circle${cls ? ` class="${cls}"` : ''} cx="${f(x)}" cy="${f(y)}" r="${r}" stroke="${color}" stroke-width="2.4" stroke-linecap="round" ` +
      `stroke-dasharray="${f(len * Math.max(0.02, Math.min(1, share)))} ${f(len)}" transform="rotate(-90 ${f(x)} ${f(y)})"/>`
    )
  }
  const star = (x: number, y: number, s: number, fill: string) =>
    `<path transform="translate(${f(x)} ${f(y)}) scale(${s})" d="M0 -10 C1 -3 3 -1 10 0 C3 1 1 3 0 10 C-1 3 -3 1 -10 0 C-3 -1 -1 -3 0 -10Z" fill="${fill}" stroke="none"/>`
  const parts: string[] = []
  for (const n of nodes) {
    const { x, y } = n
    const on = focus === n.id
    if (!n.agent) {
      parts.push(`<circle class="br" cx="0" cy="0" r="30" fill="url(#halo)" stroke="none"/>`)
      if (on) parts.push(`<circle cx="0" cy="0" r="25" stroke="#cfc7ff" stroke-opacity=".55" stroke-width="1"/>`)
      parts.push(`<circle cx="0" cy="0" r="15" fill="#221c3a" stroke="#4a3f80" stroke-width="1.2"/>`)
      parts.push(ring(0, 0, 19, mainShare, '#a79cf7'))
      parts.push(star(0, 0, 0.9, '#a79cf7'))
      parts.push(`<text x="0" y="40" text-anchor="middle" class="${on ? 'tf' : 't'}">This chat</text>`)
      continue
    }
    const a = n.agent
    const col = STATE_COLOR[a.state]
    const live = a.state === 'running' || a.state === 'waiting' || a.state === 'picking'
    if (live) parts.push(`<circle class="br" cx="${f(x)}" cy="${f(y)}" r="18" fill="${col}" fill-opacity=".14" stroke="none"/>`)
    if (on) parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="16" stroke="#cfc7ff" stroke-opacity=".55" stroke-width="1"/>`)
    parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="8" fill="#141416" stroke="${col}" stroke-opacity=".5" stroke-width="1.2"/>`)
    parts.push(ring(x, y, 11, agentShare(a), col, a.state === 'waiting' ? 'pl' : a.state === 'picking' ? 'sp' : ''))
    if (a.state === 'done') parts.push(`<path d="M${f(x - 3.6)} ${f(y)} l2.6 2.6 l4.8 -5" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`)
    else if (a.state === 'failed') parts.push(`<path d="M${f(x - 3)} ${f(y - 3)} l6 6 M${f(x + 3)} ${f(y - 3)} l-6 6" stroke="${col}" stroke-width="1.7" stroke-linecap="round"/>`)
    else parts.push(`<circle class="br" cx="${f(x)}" cy="${f(y)}" r="3" fill="${col}" stroke="none"/>`)
    const name = a.type.length > 16 ? `${a.type.slice(0, 15)}…` : a.type
    parts.push(`<text x="${f(x)}" y="${f(y + 28)}" text-anchor="middle" class="${on ? 'tf' : a.state === 'done' || a.state === 'failed' ? 'td' : 't'}">${name}</text>`)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    '<style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}' +
    ".t{font:600 11.5px system-ui,'Segoe UI',sans-serif;fill:#d4d4d8}.td{font:11.5px system-ui,'Segoe UI',sans-serif;fill:#8b8b93}" +
    ".tf{font:700 12px system-ui,'Segoe UI',sans-serif;fill:#ffffff}" +
    '.fl{animation:fl 1.2s linear infinite}@keyframes fl{to{stroke-dashoffset:-14}}' +
    '.br{animation:br 2.6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.45}50%{opacity:1}}' +
    '.pl{animation:pl 1.6s ease-in-out infinite}@keyframes pl{0%,100%{opacity:.35}50%{opacity:1}}' +
    '.sp{transform-box:fill-box;transform-origin:center;animation:sp 1.4s linear infinite}@keyframes sp{to{transform:rotate(270deg)}}</style>' +
    '<defs><radialGradient id="halo"><stop offset="0" stop-color="#a79cf7" stop-opacity=".35"/><stop offset="1" stop-color="#a79cf7" stop-opacity="0"/></radialGradient>' +
    '<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r=".8" fill="#ffffff" fill-opacity=".08"/></pattern></defs>' +
    `<g transform="translate(${f(w / 2)} ${f(h / 2)})"><g transform="scale(${cam.z})">${scale}` +
    `<g transform="translate(${f(-cam.x)} ${f(-cam.y)})" fill="none">${move}` +
    `<rect x="-4000" y="-4000" width="8000" height="8000" fill="url(#dots)"/>${links}${parts.join('')}</g></g></g></svg>`
  )
}

/** Weighted tokens, short: 514k, 1.2M. */
export function tokensText(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

/** Where the work stands: the step the main chat is on (its phase) and how far along it is, 0-1. */
export function phaseOf(agents: readonly AgentRec[], steps: readonly ProgressStep[] | null): { title: string; share: number } {
  if (steps && steps.length) {
    const now = steps.find(s => s.status === 'in_progress') ?? steps.find(s => s.status === 'pending')
    const done = steps.every(s => s.status === 'completed')
    return { title: done ? 'All steps done' : (now?.label ?? 'Working'), share: progressShare(steps) }
  }
  const finished = agents.filter(a => a.state === 'done').length
  return { title: agents.length ? moodWord(agents) : 'Nothing running', share: agents.length ? finished / agents.length : 0 }
}

/** A text cut to `n` characters with an ellipsis. */
const short = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

/** What an agent is doing, in a few words: what it waits on, how it ended, or its current tool. */
function statusOf(a: AgentRec, nowMs: number): string {
  return a.state === 'waiting' ? `waiting on ${a.now ?? 'a tool'}`
    : a.state === 'picking' ? 'picking a model'
    : a.state === 'done' ? `done in ${clockText((a.endedAt ?? nowMs) - a.startedAt)}`
    : a.state === 'failed' ? `failed after ${clockText((a.endedAt ?? nowMs) - a.startedAt)}`
    : a.now ?? 'starting'
}

/**
 * The top of the pane follows the node in focus: its name, its share done and the progress band's own track of its
 * steps. This chat shows the whole job (its step list), an agent its own.
 */
function focusHead(d: AgentsDraw, focus: AgentRec | null, agents: readonly AgentRec[]) {
  const { Box, Text, Svg } = d
  const phase = phaseOf(agents, d.steps)
  const share = focus ? agentShare(focus) : phase.share
  const steps: ProgressStep[] = focus
    ? focus.steps?.length ? [...focus.steps] : [{ id: focus.id, label: focus.task, doing: focus.task, status: focus.state === 'done' || focus.state === 'failed' ? 'completed' : focus.state === 'picking' ? 'pending' : 'in_progress' }]
    : d.steps && d.steps.length ? [...d.steps] : agentsAsSteps(agents)
  const look: Progress['phase'] = share >= 1 ? 'done' : focus?.state === 'waiting' ? 'asking' : focus?.state === 'picking' ? 'planning' : 'working'
  const color = focus ? STATE_COLOR[focus.state] : ACCENT
  const live = agents.filter(a => a.state !== 'done' && a.state !== 'failed').length
  const line1 = focus ? focus.task : phase.title
  const line2 = focus
    ? [focus.model ? (focus.effort ? `${focus.model} ${focus.effort}` : focus.model) : '', statusOf(focus, d.nowMs)].filter(Boolean).join(' · ')
    : agents.length ? `${agents.length} agent${agents.length > 1 ? 's' : ''}, ${live} still going` : 'No agents yet'
  return (
    <Box key="agents-focus" flexDirection="column">
      <Box flexDirection="row" alignItems="center">
        <Text color={color} bold>{focus ? '● ' : '✦ '}</Text>
        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Text color={TEXT} bold wrap="truncate">{focus ? focus.type : 'This chat'}</Text>
        </Box>
        <Text color={TEXT} bold>{`  ${Math.round(share * 100)}%`}</Text>
      </Box>
      {Svg && steps.length ? <Svg source={progressTrackSvg({ phase: look, steps })} alt={`${Math.round(share * 100)}% done`} width={1000} height={24} /> : null}
      <Text color={TEXT} wrap="truncate">{line1}</Text>
      <Text color={focus ? color : DIM} wrap="truncate">{line2}</Text>
    </Box>
  )
}

/** One small control in its own box, as the bar draws its buttons (each hoverable control apart). */
function tool(d: AgentsDraw, key: string, label: string, onPress: () => unknown) {
  const { Box, Button } = d
  return (
    <Box key={`${key}-box`} flexShrink={0} marginLeft={1}>
      <Button key={key} variant="secondary" label={label} onPress={onPress} />
    </Box>
  )
}

/**
 * The overview: the map in a card of its own. A click on a node puts it in focus and glides it to the middle; a drag
 * pans and the wheel zooms where the surface hands the pointer to the Client laid over it; −, + and Fit always do.
 */
function overview(d: AgentsDraw, nodes: readonly NetNode[], focus: string, mainShare: number) {
  const { Box, Text, Button, Svg } = d
  const m = mapSize(d.cols, d.rows)
  const cam = camNow(d.cam, Number.MAX_SAFE_INTEGER)
  const hits = nodes
    .map(n => ({ n, px: m.w / 2 + (n.x - cam.x) * cam.z, py: m.h / 2 + (n.y - cam.y) * cam.z }))
    .filter(p => p.px > 10 && p.px < m.w - 10 && p.py > 10 && p.py < m.h - 10)
  return (
    <Box key="agents-overview" flexDirection="column" paddingX={1} backgroundColor={CARD_BG} borderStyle="round" borderColor={CARD_EDGE}>
      <Box flexDirection="row" alignItems="center">
        <Text color={TEXT} bold>Overview</Text>
        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Text dimColor wrap="truncate">{d.mapClient ? '  drag, scroll to zoom' : ''}</Text>
        </Box>
        {tool(d, 'map-out', '−', () => d.onZoom(1 / 1.3))}
        {tool(d, 'map-in', '+', () => d.onZoom(1.3))}
        {tool(d, 'map-fit', 'Fit', () => d.onFit())}
      </Box>
      <Box key="agents-map-box" position="relative" width={m.cols} height={m.rows} overflow="hidden">
        {Svg ? (
          <Box position="absolute" top={0} left={0}>
            <Svg source={mapSvg(nodes, m.w, m.h, d.cam, d.nowMs, focus, mainShare)} alt={`this chat and ${nodes.length - 1} agents`} width={m.w} height={m.h} />
          </Box>
        ) : null}
        {/* Two rows of hit area per node: a Box sits on whole cells, so one row could miss the node by half a row. */}
        {hits.map(({ n, px, py }) => (
          <Box key={`node-${n.id}`} position="absolute" top={Math.max(0, Math.floor(py / CELL_H - 0.5))} left={Math.max(0, Math.round(px / CELL_W - 2.5))}
            width={5} height={2} flexDirection="column" alignItems="center">
            {/* No-break spaces: plain ones collapse and leave a button too narrow to hit the node. */}
            <Button key={`node-${n.id}-press`} plain label={'   '} hover={{ backgroundColor: '#00000000' }} onPress={() => d.onFocus(n.id)} />
            <Button key={`node-${n.id}-press2`} plain label={'   '} hover={{ backgroundColor: '#00000000' }} onPress={() => d.onFocus(n.id)} />
          </Box>
        ))}
        {d.mapClient ? (
          <Box key="agents-map-touch" position="absolute" top={0} left={0} right={0} bottom={0}>
            {d.mapClient}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

/** One agent as a row of the status card: its state mark, name, task, and on the right the one thing worth seeing. */
function agentRow(d: AgentsDraw, a: AgentRec, focus: string) {
  const { Box, Text, Button } = d
  const c = STATE_COLOR[a.state]
  const mark = a.state === 'done' ? '✓' : a.state === 'failed' ? '✕' : a.state === 'waiting' ? '◉' : '◐'
  const right =
    a.state === 'waiting' ? `on ${short(a.now ?? 'a tool', 16)}`
    : a.state === 'failed' ? 'failed'
    : a.state === 'picking' ? 'picking'
    : a.state === 'done' ? clockText((a.endedAt ?? d.nowMs) - a.startedAt)
    : a.steps?.length ? `${Math.round(progressShare(a.steps) * 100)}%`
    : 'working'
  return (
    <Box key={`row-${a.id}`} position="relative" flexDirection="row" backgroundColor={focus === a.id ? '#222228' : undefined}>
      <Text color={c} bold>{`${mark} `}</Text>
      <Text color={a.state === 'done' ? DIM : TEXT} bold={a.state !== 'done'}>{a.type}</Text>
      <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Text dimColor wrap="truncate">{`  ${a.task}`}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={a.state === 'done' ? DIM : c} wrap="truncate">{`  ${right}`}</Text>
      </Box>
      <Box position="absolute" top={0} left={0} right={0} bottom={0}>
        <Button key={`row-${a.id}-press`} plain label={' '.repeat(60)} hover={{ backgroundColor: '#ffffff0d' }} onPress={() => d.onFocus(a.id)} />
      </Box>
    </Box>
  )
}

/** A group of the status card: a title with its count, then its rows. Nothing when it has none. */
function group(d: AgentsDraw, key: string, title: string, color: string, rows: readonly AgentRec[], focus: string) {
  const { Box, Text } = d
  if (!rows.length) return null
  return (
    <Box key={`sec-${key}`} flexDirection="column">
      <Box flexDirection="row">
        <Text color={color} bold>{title}</Text>
        <Text dimColor>{`  ${rows.length}`}</Text>
      </Box>
      {rows.map(a => agentRow(d, a, focus))}
    </Box>
  )
}

/** A card under the overview: a bold title, a dim note on the right, its body. */
function card(d: AgentsDraw, key: string, title: string, aside: string, body: unknown) {
  const { Box, Text } = d
  return (
    <Box key={key} flexDirection="column" paddingX={1} backgroundColor={CARD_BG} borderStyle="round" borderColor={CARD_EDGE}>
      <Box flexDirection="row">
        <Text color={TEXT} bold>{title}</Text>
        <Box flexGrow={1} />
        <Text dimColor>{aside}</Text>
      </Box>
      {body}
    </Box>
  )
}

/** The status card: what needs you, what works, what is done (folded to its title until pressed). */
function statusCard(d: AgentsDraw, agents: readonly AgentRec[], focus: string) {
  const { Box, Text, Button } = d
  const needs = agents.filter(a => a.state === 'waiting' || a.state === 'failed')
  const working = agents.filter(a => a.state === 'running' || a.state === 'picking')
  const done = agents.filter(a => a.state === 'done')
  const aside = needs.length ? `${needs.length} need${needs.length > 1 ? '' : 's'} you` : working.length ? `${working.length} working` : agents.length ? 'All done' : ''
  return card(d, 'agents-status', 'Status', aside, (
    <Box flexDirection="column">
      {group(d, 'needs', 'Needs you', STATE_COLOR.waiting, needs, focus)}
      {group(d, 'working', 'Working', ACCENT, working, focus)}
      {done.length ? (
        <Box key="sec-done" position="relative" flexDirection="column">
          <Box position="relative" flexDirection="row">
            <Text color={STATE_COLOR.done} bold>{d.doneOpen ? '▾ Done' : '▸ Done'}</Text>
            <Text dimColor>{`  ${done.length}`}</Text>
            <Box flexGrow={1} />
            <Box position="absolute" top={0} left={0} right={0} bottom={0}>
              <Button key="done-press" plain label={' '.repeat(60)} hover={{ backgroundColor: '#ffffff0d' }} onPress={() => d.onDone()} />
            </Box>
          </Box>
          {d.doneOpen ? done.map(a => agentRow(d, a, focus)) : null}
        </Box>
      ) : null}
      {!agents.length ? <Text dimColor>Agents show here when Claude sends some off.</Text> : null}
    </Box>
  ))
}

/** The usage card: weighted tokens in all, and who spent them, the biggest first, as bars. */
function usageCard(d: AgentsDraw, agents: readonly AgentRec[]) {
  const { Box, Text, Svg } = d
  const rows = [
    { id: 'main', name: 'This chat', cost: d.mainCost, color: ACCENT },
    ...agents.map(a => ({ id: a.id, name: a.type, cost: a.cost ?? 0, color: STATE_COLOR[a.state] })),
  ]
    .filter(r => r.cost > 0)
    .sort((a, b) => b.cost - a.cost)
  const total = rows.reduce((s, r) => s + r.cost, 0)
  if (!total) return null
  const top = rows[0].cost
  const barCols = Math.max(6, d.cols - 6 - 16 - 7)
  const bar = (share: number, color: string) => {
    const w = Math.round(barCols * CELL_W)
    const len = Math.max(3, Math.round(w * share))
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${CELL_H}" viewBox="0 0 ${w} ${CELL_H}"><rect x="0" y="7" width="${w}" height="5" rx="2.5" fill="#ffffff" fill-opacity=".06"/><rect x="0" y="7" width="${len}" height="5" rx="2.5" fill="${color}"/></svg>`
  }
  return card(d, 'agents-usage', 'Usage', `${tokensText(total)} tokens`, (
    <Box flexDirection="column">
      {rows.slice(0, 5).map(r => (
        <Box key={`use-${r.id}`} flexDirection="row">
          <Box width={16} flexShrink={0} overflow="hidden">
            <Text color={TEXT} wrap="truncate">{r.name}</Text>
          </Box>
          {Svg ? <Svg source={bar(r.cost / top, r.color)} alt={`${Math.round((r.cost / total) * 100)}%`} width={Math.round(barCols * CELL_W)} height={CELL_H} /> : <Box flexGrow={1} />}
          <Box width={7} flexShrink={0} justifyContent="flex-end">
            <Text dimColor>{tokensText(r.cost)}</Text>
          </Box>
        </Box>
      ))}
      {rows.length > 5 ? <Text dimColor>{`and ${rows.length - 5} more`}</Text> : null}
    </Box>
  ))
}

/** Who a note reaches: this chat, and every agent still going when it was sent. */
export function noteReach(note: AgentNote, agents: readonly AgentRec[]): string[] {
  return ['main', ...agents.filter(a => a.startedAt <= note.at && (a.endedAt === undefined || a.endedAt > note.at)).map(a => a.id)]
}

/** The note card: a field whose Enter sends a note to every agent, read with their next tool result; the last few. */
function noteCard(d: AgentsDraw, agents: readonly AgentRec[]) {
  const { Box, Text, Input } = d
  if (!Input) return null
  const notes = d.notes.slice(-3).reverse()
  return card(d, 'agents-note', 'Note to every agent', 'read with their next step', (
    <Box flexDirection="column">
      <Input key={`agents-note-input-${d.notes.length}`} placeholder="Type a note, Enter sends it" submitLabel="send" value="" onSubmit={(text: string) => d.onNote(text)} />
      {notes.map(n => {
        const reach = noteReach(n, agents)
        const read = n.seen.filter(id => reach.includes(id)).length
        return (
          <Box key={`note-${n.id}`} flexDirection="row">
            <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Text color={TEXT} wrap="truncate">{`“${n.text}”`}</Text>
            </Box>
            <Text color={read >= reach.length ? STATE_COLOR.done : DIM}>{`  read by ${read} of ${reach.length}`}</Text>
          </Box>
        )
      })}
    </Box>
  ))
}

/** The settings bar's wordmark, recoloured to the brand's violet and drawn across the pane's whole width. */
function wordmarkSvg(source: string, w: number): { source: string; w: number; h: number } {
  const h = Math.round((w * 28) / 92)
  return { source: source.replace('width="92" height="28"', `width="${w}" height="${h}"`).replace(/#f4f2ff/g, ACCENT), w, h }
}

/**
 * The whole pane on the dashboard's dark ground, padded: the focused node's progress on top, the overview under it,
 * then the status, usage and note cards, and the wordmark across the bottom.
 */
export function agentsPane(d: AgentsDraw, agents: readonly AgentRec[]) {
  const { Box, Text, Svg } = d
  const nodes = worldLayout(agents)
  const focusId = d.focus && nodes.some(n => n.id === d.focus) ? d.focus : 'main'
  const focus = agents.find(a => a.id === focusId) ?? null
  const phase = phaseOf(agents, d.steps)
  const mark = wordmarkSvg(d.wordmark, Math.round((d.cols - 4) * CELL_W))
  return (
    <Box key="agents" position="relative" flexDirection="column" minHeight={d.rows} paddingX={1} paddingY={1} gap={1}
      backgroundColor={PANE_BG} borderStyle="round" borderColor={CARD_EDGE}>
      {focusHead(d, focus, agents)}
      {overview(d, nodes, focusId, phase.share)}
      {statusCard(d, agents, focusId)}
      {usageCard(d, agents)}
      {noteCard(d, agents)}
      <Box flexGrow={1} />
      <Box flexDirection="row" justifyContent="center">
        {Svg ? <Svg source={mark.source} alt="effortless" width={mark.w} height={mark.h} /> : <Text color={ACCENT} bold>effortless</Text>}
      </Box>
    </Box>
  )
}

/** With no step list of its own, the chat's agents stand in as its steps for the bar: finished, going, not started. */
function agentsAsSteps(agents: readonly AgentRec[]): ProgressStep[] {
  return agents.map(a => ({
    id: a.id,
    label: a.type,
    doing: a.task,
    status: a.state === 'done' || a.state === 'failed' ? 'completed' : a.state === 'picking' ? 'pending' : 'in_progress',
  }))
}

/** Sample agents for `/effortless agents demo`: one of each state, so the pane can be seen without a real run. */
export function demoAgents(nowMs: number): AgentRec[] {
  const step = (label: string, status: 'completed' | 'in_progress' | 'pending', i: number) => ({ id: `s${i}`, label, doing: label, status })
  return [
    { id: 'demo-1', type: 'Explore', task: 'find the pane and agent hooks', state: 'running', startedAt: nowMs - 103_000, model: 'Haiku', effort: 'Low', why: 'read-only search, wide but shallow', file: 'hooks/agents.tsx', cost: 61_000,
      now: 'Grep "agentId" in hooks/', steps: [step('List hooks', 'completed', 0), step('Read types', 'completed', 1), step('Find spawn', 'in_progress', 2), step('Report', 'pending', 3)] },
    { id: 'demo-2', type: 'code-reviewer', task: 'review the agent-panel branch', state: 'waiting', file: 'tests/effortless.test.ts', startedAt: nowMs - 251_000, waitingSince: nowMs - 38_000, now: 'Bash npm test', model: 'Opus', effort: 'High', why: 'a review before merge: misses cost more', cost: 182_000 },
    { id: 'demo-3', type: 'Plan', task: 'outline the release notes', state: 'picking', startedAt: nowMs - 2_000 },
    { id: 'demo-4', type: 'general-purpose', task: 'add state for the panel', state: 'done', startedAt: nowMs - 400_000, endedAt: nowMs - 208_000, model: 'Sonnet', effort: 'Medium', cost: 240_000 },
    { id: 'demo-5', parentId: 'demo-4', type: 'Explore', task: 'read the tests', state: 'done', startedAt: nowMs - 380_000, endedAt: nowMs - 340_000, model: 'Haiku', effort: 'Low' },
  ]
}

/** The files the sample agents touched, for `/effortless agents demo`: three parts of the code and how they import. */
export function demoFiles(nowMs: number): FileTouch[] {
  const f = (path: string, edited: boolean, imports: string[]): FileTouch => ({ path, edited, by: ['main'], lastAt: nowMs, imports })
  return [
    f('hooks/register.tsx', true, ['hooks/agents', 'hooks/progress', 'hooks/art', 'hooks/brand-mark', 'types']),
    f('hooks/agents.tsx', true, ['hooks/progress', 'hooks/brand-mark', 'types']),
    f('hooks/progress.tsx', false, ['types']),
    f('types/index.d.ts', true, []),
    f('tests/effortless.test.ts', false, ['hooks/register', 'hooks/progress']),
    f('docs/agent-panel/PLAN.md', false, []),
    f('tools/render-band/render.mjs', false, []),
  ]
}

/** The main chat's own list for the demo: what the whole job is, step by step. */
export function demoSteps(): ProgressStep[] {
  const step = (label: string, status: ProgressStep['status'], i: number): ProgressStep => ({ id: `m${i}`, label, doing: label, status })
  return [
    step('Find the hooks', 'completed', 0),
    step('Add the state', 'completed', 1),
    step('Draw the pane', 'in_progress', 2),
    step('Review the branch', 'pending', 3),
    step('Release', 'pending', 4),
  ]
}
