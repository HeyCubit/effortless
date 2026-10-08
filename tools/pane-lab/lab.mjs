#!/usr/bin/env node
// Pane lab: the agent pane as the Claude desktop app (Code tab) draws it, live, in a browser, run by the real mod.
//
//   node tools/pane-lab/lab.mjs [--port 7360] [--setup "agents demo"] [--pane effortless-agents]
//
// The page draws the pane's tree with the installed desktop app's own renderer chunk and stylesheets (as
// tools/render-band does), inside the same site the app gives a Pane: a padded body that scrolls natively. Every
// press, Enter in a field and pointer act on a Client goes back here; the server replays the whole list of acts
// through the real hooks under `claude plugin test` (a copy of hooks/ taken fresh on each act, so an edit shows on the
// next act) and answers with the tree the mod returns. The acts keep their timing on the mod's clock, so a glide
// started by a click is drawn as far in as the time since.
//
// Endpoints: GET / (the page), POST /act {act}, POST /reset {bodyColumns, bodyRows, setup?}, GET /acts.
import { spawnSync, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1]
}
const port = Number(opt('port', '7360'))
const pane = opt('pane', 'effortless-agents')
const title = opt('title', 'Agents')
let setup = opt('setup', 'agents demo').split(';').map((s) => s.trim()).filter(Boolean)

// --- The installed app (as tools/render-band/render.mjs finds it) -----------------------------------------------------
const ionDist = resolve(opt('app', '') || findApp())
const assets = join(ionDist, 'assets', 'v1')
const indexHtml = readFileSync(join(ionDist, 'index.html'), 'utf8')
const stylesheets = [...indexHtml.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1])
const inlineStyles = [...indexHtml.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)].filter((m) => !m[1].includes('static-composer')).map((m) => m[2])
const chunks = readdirSync(assets).filter((f) => f.endsWith('.js'))
const renderer = chunks.find((f) => {
  const s = readFileSync(join(assets, f), 'utf8')
  return s.includes('data-press-cue') && s.includes('--engine-band-line') && s.includes('data-engine-tree')
})
if (!renderer) fail('could not find the renderer chunk in ' + assets)
const rendererSource = readFileSync(join(assets, renderer), 'utf8')
const importsOf = [...rendererSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([^"]+)"/g)].flatMap((m) =>
  m[1].split(',').map((p) => {
    const [name, local] = p.trim().split(/\s+as\s+/)
    return { name, local: local ?? name, file: m[2] }
  }),
)
const definitionOf = (file, exported) => {
  const s = readFileSync(join(assets, file), 'utf8')
  const ex = s.slice(s.lastIndexOf('export{'))
  const esc = (x) => x.replace(/[$]/g, '\\$')
  const m = new RegExp('([\\w$]+) as ' + esc(exported) + '[,}]').exec(ex) ?? new RegExp('[{,]' + esc(exported) + '[,}]').exec(ex)
  if (!m) return ''
  const local = m[1] ?? exported
  const d = new RegExp('(function ' + esc(local) + '\\(|[,; ]' + esc(local) + '=)').exec(s)
  return d ? s.slice(d.index, d.index + 300) : ''
}
const keyOf = (i) => `${i.file.replace(/-[\w-]{8}\.js$/, '')}:${i.name}`
const sourceOf = (i) => readFileSync(join(assets, i.file), 'utf8')
const tokensImport = importsOf.find((i) => sourceOf(i).startsWith('var e={radius:{cssVar:'))
const purifyImport = importsOf.find((i) => i.name === 't' && sourceOf(i).includes('DOMPurify') && /export\{\w+ as t\};?\s*$/.test(sourceOf(i)))
const windowImport = importsOf.find((i) => /^function \w+\(e\)\{return e\?\(\w+\(e\)\?e:e\.ownerDocument\)\?\.defaultView\?\?null:null\}/.test(definitionOf(i.file, i.name)))
const elementImport = importsOf.find((i) => /^function \w+\(e\)\{return e\?\.nodeType===1\?e:null\}/.test(definitionOf(i.file, i.name)))
if (!tokensImport || !windowImport || !elementImport) fail('renderer imports changed')
const zoom = appZoom()

// --- The session: the acts the page sent, replayed through the real hooks ---------------------------------------------
let size = { bodyColumns: 46, bodyRows: 40 }
let acts = []
const work = mkdtempSync(join(tmpdir(), 'effortless-pane-lab-'))
process.on('exit', () => rmSync(work, { recursive: true, force: true }))
process.on('SIGINT', () => process.exit(0))

function replay(at) {
  for (const part of ['.claude-plugin', 'hooks', 'commands', 'sounds', 'types', 'tsconfig.json']) {
    rmSync(join(work, part), { recursive: true, force: true })
    if (existsSync(join(REPO, part))) cpSync(join(REPO, part), join(work, part), { recursive: true })
  }
  mkdirSync(join(work, 'tests'), { recursive: true })
  const lab = { pane, title, setup, ...size, acts, at }
  const test = readFileSync(join(HERE, 'lab.template.ts'), 'utf8').replace('const L: Lab = __LAB__', () => `const L: Lab = ${JSON.stringify(lab)}`)
  writeFileSync(join(work, 'tests', 'lab.test.ts'), test)
  const started = Date.now()
  const run = spawnSync(`claude plugin test "${work}"`, { encoding: 'utf8', shell: true, env: { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: '1' }, maxBuffer: 64 * 1024 * 1024 })
  const text = `${run.stdout}\n${run.stderr}`
  const pick = (tag) => {
    const line = text.split(/\r?\n/).find((l) => l.includes(tag + ' '))
    return line ? JSON.parse(line.slice(line.indexOf(tag + ' ') + tag.length + 1)) : null
  }
  const tree = pick('LAB-TREE')
  return { tree, redraw: pick('LAB-REDRAW') !== false, log: pick('LAB-LOG'), ms: Date.now() - started, error: tree ? null : text.slice(-4000) }
}

// --- The page ------------------------------------------------------------------------------------------------------------
function page(width, height) {
  const rig = {
    rendererUrl: `/assets/v1/${renderer}`,
    realModules: [tokensImport, purifyImport].filter(Boolean).map((i) => ({ key: keyOf(i), url: `/assets/v1/${i.file}`, export: i.name })),
    windowImport: keyOf(windowImport),
    elementImport: keyOf(elementImport),
    matchZoom: 0, // CSS zoom would skew the cell sums (getBoundingClientRect vs clientWidth); the page is drawn at 1
    used: [],
  }
  return `<!doctype html>
<html lang="en" data-theme="claude" data-mode="dark" data-density="comfortable" data-color-version="v2" class="cds-root antialiased">
<head>
<meta charset="utf-8">
<title>effortless pane lab</title>
${stylesheets.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
${inlineStyles.map((s) => `<style>${s}</style>`).join('\n')}
<style>
  body { margin: 0; padding: 16px; display: flex; gap: 16px; align-items: flex-start; }
  [data-lab-tile] { width: ${width}px; height: ${height}px; display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; }
  [data-lab-head] { height: 36px; flex: 0 0 auto; display: flex; align-items: center; padding: 0 12px; }
  [data-lab-body] { flex: 1 1 auto; min-height: 0; }
  [data-lab-side] { font: 12px/1.5 ui-monospace, monospace; color: #aaa; width: 320px; white-space: pre-wrap; }
</style>
</head>
<body class="bg-surface-1 text-primary font-sans">
<div class="cds-root text-primary" data-density="compact" data-mode="dark" data-platform="desktop" data-font="anthropic" style="font-size:var(--cds-font-size-body)">
  <!-- The dock tile the app puts a plugin pane in (Bh): a title row, then the body (Rh: relative h-full w-full), then
       the engine site (zm with className "h-full w-full p-lg"), its scrolling div, and the drawn host. -->
  <div data-lab-tile class="bg-surface-2 border border-border-200">
    <div data-lab-head class="text-body font-medium">${title}</div>
    <div data-lab-body class="relative h-full w-full">
      <div data-lab-outer class="min-h-0 min-w-0 text-body text-primary h-full w-full p-lg">
        <div tabindex="-1" data-engine-site="Pane" data-engine-site-instance="${pane}" data-engine-site-drawn="true" class="pointer-events-auto isolate -mx-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-1 outline-none [contain:paint] [scrollbar-gutter:stable]">
          <div style="display:block;min-width:0">
            <div data-plugin-drawn="Pane" class="[contain:none]"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div data-lab-side></div>
<script>window.RIG = ${JSON.stringify(rig).replace(/</g, '\\u003c')}</script>
<script src="/lab/page.js"></script>
</body>
</html>`
}

// --- Server ---------------------------------------------------------------------------------------------------------------
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
const roots = { '/assets/': join(ionDist, 'assets'), '/lab/': HERE }
const body = (req) => new Promise((ok) => {
  let s = ''
  req.on('data', (c) => (s += c))
  req.on('end', () => ok(s ? JSON.parse(s) : {}))
})
const json = (res, value) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value))
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = decodeURIComponent(url.pathname)
  try {
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(page(Number(url.searchParams.get('w') ?? 440), Number(url.searchParams.get('h') ?? 900)))
      return
    }
    if (path === '/reset' && req.method === 'POST') {
      const b = await body(req)
      acts = []
      if (b.bodyColumns) size = { bodyColumns: b.bodyColumns, bodyRows: b.bodyRows }
      if (Array.isArray(b.setup)) setup = b.setup
      json(res, replay(0))
      return
    }
    if (path === '/act' && req.method === 'POST') {
      const b = await body(req)
      if (b.act) acts.push(b.act)
      if (b.act?.kind === 'size') size = { bodyColumns: b.act.bodyColumns, bodyRows: b.act.bodyRows }
      json(res, replay(Math.max(b.at ?? 0, b.act?.t ?? 0)))
      return
    }
    if (path === '/acts') {
      json(res, { size, setup, acts })
      return
    }
    const prefix = Object.keys(roots).find((p) => path.startsWith(p))
    const file = prefix && resolve(roots[prefix], '.' + path.slice(prefix.length - 1))
    if (!file || !file.startsWith(roots[prefix]) || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
  } catch (err) {
    res.writeHead(500).end(String(err?.stack ?? err))
  }
}).listen(port, '127.0.0.1', () => console.log(`pane lab on http://127.0.0.1:${port}/  (renderer ${renderer}, zoom ${zoom.toFixed(4)})`))

function findApp() {
  try {
    const loc = execFileSync('powershell', ['-NoProfile', '-Command', '(Get-AppxPackage -Name Claude).InstallLocation'], { encoding: 'utf8' }).trim()
    const dir = join(loc.split(/\r?\n/).pop(), 'app', 'resources', 'ion-dist')
    if (existsSync(join(dir, 'index.html'))) return dir
  } catch {}
  fail('could not find the Claude desktop app; pass --app <...>/app/resources/ion-dist')
}

/** The app's page zoom: Chromium stores it per host as a level, factor 1.2^level (as tools/render-band reads it). */
function appZoom() {
  const prefs = join(process.env.LOCALAPPDATA ?? '', 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'Preferences')
  const other = join(process.env.APPDATA ?? '', 'Claude', 'Preferences')
  for (const p of [prefs, other]) {
    try {
      const levels = JSON.parse(readFileSync(p, 'utf8')).partition?.per_host_zoom_levels ?? {}
      for (const hosts of Object.values(levels)) if (typeof hosts['claude.ai'] === 'number') return 1.2 ** hosts['claude.ai']
    } catch {}
  }
  return 1
}

function fail(message) {
  console.error(`pane-lab: ${message}`)
  process.exit(1)
}
