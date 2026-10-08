#!/usr/bin/env node
// Drives the pane lab in headless Chrome at the desktop app's zoom (as the device scale factor, so 1ch and 1lh are the
// app's) with real mouse and keyboard events, and saves a PNG of the pane after the steps that ask for one.
//
//   node tools/pane-lab/drive.mjs steps.json [--lab http://127.0.0.1:7360] [--w 440] [--h 1000] [--out dir]
//
// steps.json is a list run in order:
//   { "shot": "name" }                       a PNG of the pane tile: <out>/<name>.png
//   { "click": "button-key" }                a real click in the middle of the drawn button with that key
//   { "clickAt": [fx, fy], "in": "key" }     a click at a share of a Client's box (the map), or of the pane tile
//   { "drag": [[fx, fy], [tx, ty]], "in": "key", "steps": 8, "midShot": "name" }   press, move, (shot), release
//   { "wheel": 300, "at": [fx, fy] }         a wheel turn over the tile (px; positive scrolls down)
//   { "type": "text", "enter": true, "into": "key-prefix" }     click the field, type, Enter
//   { "wait": 600 }                          real time, for a glide or the lab's answer
//   { "eval": "js" }                         prints what the expression returns (inspection)
// Each step waits for the lab to answer (the page marks data-lab-busy) before the next.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1]
}
const stepsFile = argv.find((a) => !a.startsWith('--') && a.endsWith('.json'))
if (!stepsFile) fail('usage: drive.mjs steps.json')
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'))
const lab = opt('lab', 'http://127.0.0.1:7360')
const W = Number(opt('w', '440'))
const H = Number(opt('h', '1000'))
const out = resolve(opt('out', join(HERE, 'out')))
mkdirSync(out, { recursive: true })
const zoom = appZoom()

const profile = mkdtempSync(join(tmpdir(), 'effortless-pane-drive-'))
const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
try {
  const portFile = join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100)
  const port = readFileSync(portFile, 'utf8').split('\n')[0]
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((ok, no) => ((ws.onopen = ok), (ws.onerror = no)))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((ok, no) => {
      const n = ++id
      const timer = setTimeout(() => (pending.delete(n), no(new Error(`${method}: no answer in 15 s`))), 15_000)
      pending.set(n, (msg) => (clearTimeout(timer), msg.error ? no(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)))
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  const js = async (expression) => {
    if (process.env.LAB_TRACE) console.log('  js ' + expression.slice(0, 60))
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await send('Emulation.setDeviceMetricsOverride', { width: W + 380, height: H + 40, deviceScaleFactor: zoom, mobile: false })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await send('Page.enable')
  await send('Page.navigate', { url: `${lab}/?w=${W}&h=${H}` })
  for (let i = 0; i < 300; i++) {
    await sleep(100)
    const s = await js('document.documentElement.dataset.labReady || ""').catch(() => '')
    if (s === '1') break
    if (s === 'error' || i === 299) fail(`the lab page did not start: ${await js('document.querySelector("[data-lab-side]")?.textContent || ""')}`)
  }
  const idle = async () => {
    for (let i = 0; i < 600; i++) {
      const busy = await js('Number(document.documentElement.dataset.labBusy || 0)')
      if (!busy) return
      await sleep(50)
    }
  }
  await idle()
  // Where things are, in CSS px of the page: a button by key, a Client's box, the tile.
  const box = (selector) =>
    js(`(() => { const r = window.LAB.root; const e = ${selector}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })()`)
  const buttonBox = (key) => box(`[...r.querySelectorAll('button[data-press-key]')].find((b) => b.getAttribute('data-press-key') === ${JSON.stringify(key)})`)
  const clientBox = (key) => box(`r.querySelector('[data-lab-client=${JSON.stringify(key)}]')`)
  const tileBox = () => js('(() => { const b = document.querySelector("[data-lab-tile]").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })()')
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse', ...extra })
  const log = { push: (line) => console.log(line), join: () => "" }
  for (const step of steps) {
    if (process.env.LAB_TRACE) console.log('step ' + JSON.stringify(step))
    const shoot = async (name, settle) => {
      await sleep(settle ?? 250)
      const t = await tileBox()
      const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: t.x, y: t.y, width: t.w, height: t.h, scale: 1 } })
      const png = join(out, `${name}.png`)
      writeFileSync(png, Buffer.from(data, 'base64'))
      log.push(`shot ${png}`)
    }
    if (step.shot) {
      await shoot(step.shot, step.settle)
    } else if (step.click) {
      const b = await buttonBox(step.click)
      if (!b) {
        log.push(`click ${step.click}: no such button drawn`)
        continue
      }
      const x = b.x + b.w / 2
      const y = b.y + b.h / 2
      await mouse('mouseMoved', x, y, { buttons: 0 })
      await mouse('mousePressed', x, y)
      await mouse('mouseReleased', x, y)
      log.push(`click ${step.click}`)
    } else if (step.clickAt || step.drag) {
      const b = step.in ? await clientBox(step.in) : await tileBox()
      if (!b) {
        log.push(`${step.in}: no such Client drawn`)
        continue
      }
      const pt = ([fx, fy]) => [b.x + fx * b.w, b.y + fy * b.h]
      const [from, to] = step.drag ? step.drag.map(pt) : [pt(step.clickAt), pt(step.clickAt)]
      await mouse('mouseMoved', from[0], from[1], { buttons: 0 })
      await mouse('mousePressed', from[0], from[1])
      const n = step.drag ? step.steps ?? 8 : 0
      for (let i = 1; i <= n; i++) {
        await mouse('mouseMoved', from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n)
        await sleep(70)
      }
      // A picture with the button still down: what the app shows mid-drag (the pane held, the Client live).
      if (step.midShot) {
        await idle()
        await shoot(step.midShot)
      }
      await mouse('mouseReleased', to[0], to[1])
      log.push(step.drag ? `drag ${step.in ?? 'tile'} ${JSON.stringify(step.drag)}` : `clickAt ${step.in ?? 'tile'} ${JSON.stringify(step.clickAt)}`)
    } else if (step.wheel) {
      const t = await tileBox()
      const [fx, fy] = step.at ?? [0.5, 0.6]
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: t.x + fx * t.w, y: t.y + fy * t.h, deltaX: 0, deltaY: step.wheel })
      log.push(`wheel ${step.wheel} -> scrollTop ${await js('document.querySelector("[data-engine-site]").scrollTop')}`)
    } else if (step.type !== undefined) {
      const b = await box(`r.querySelector('input')`)
      if (!b) {
        log.push('type: no field drawn')
        continue
      }
      await mouse('mouseMoved', b.x + 10, b.y + b.h / 2, { buttons: 0 })
      await mouse('mousePressed', b.x + 10, b.y + b.h / 2)
      await mouse('mouseReleased', b.x + 10, b.y + b.h / 2)
      await send('Input.insertText', { text: step.type })
      if (step.enter) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      }
      log.push(`type ${JSON.stringify(step.type)}`)
    } else if (step.wait) {
      await sleep(step.wait)
    } else if (step.eval) {
      log.push(`eval ${JSON.stringify(await js(step.eval))}`)
    }
    await sleep(80)
    await idle()
  }
  const side = await js('document.querySelector("[data-lab-side]").textContent')
  console.log(log.join('\n'))
  console.log(`lab: ${side.split('\n').slice(0, 3).join(' | ')}`)
  ws.close()
} finally {
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

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

function findChrome() {
  const candidates = [
    join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  ]
  const found = candidates.find((c) => existsSync(c))
  if (!found) fail('no Chrome or Edge found')
  return found
}

function sleep(ms) {
  return new Promise((ok) => setTimeout(ok, ms))
}

function fail(message) {
  console.error(`pane-lab drive: ${message}`)
  process.exit(1)
}
