// Runs in the pane lab page. Loads the desktop app's own renderer chunk exactly as tools/render-band/page.js does (its
// imports stubbed, the design tokens and DOMPurify real) and draws the mod's Pane tree with it. Unlike the band rig it
// is live: a press, Enter in a field and the pointer on a Client go to the lab server as acts, and the tree that comes
// back is drawn in place, the scroll position kept, as the app's site does.
//
// What mirrors the app (c95e4d2cf-*.js): the site's classes and its max height (whole rows of 1lh, zm), the body's
// columns (jm: floor of the site's inner width over 1ch), the Pane's shapeTree (wm), a Client's host (al) holding a
// div with the frame's style (ic), and its pointer acts in cells (ge: floor of the offset over 1ch and 1lh), with the
// pointer held from down to up. Wheel and scroll stay native: the app's site scrolls by itself.
/* global RIG */
;(async () => {
  const side = document.querySelector('[data-lab-side]')
  const say = (text) => {
    side.textContent = text
  }
  const t0 = performance.now()
  const now = () => Math.round(performance.now() - t0)
  try {
    const R = window.RIG
    if (R.matchZoom) document.documentElement.style.zoom = String(R.matchZoom / devicePixelRatio)
    const [source, ...modules] = await Promise.all([fetch(R.rendererUrl).then((r) => r.text()), ...R.realModules.map((m) => import(m.url))])
    const imports = new Map()
    let body = source.replace(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?/g, (_m, list, from) => {
      for (const part of list.split(',')) {
        const m = part.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/)
        if (m) imports.set(m[2] ?? m[1], { from, name: m[1] })
      }
      return ';'
    })
    body = body.replace(/import\s*"[^"]+";?/g, ';')
    body = body.replace(/export\s*\{[^}]*\}(?=[;\s]*$)/, '')
    body = body.replace(/import\.meta/g, '__importMeta')
    const stub = (() => {
      const target = function () {}
      let proxy
      proxy = new Proxy(target, {
        get(_t, key) {
          if (key === Symbol.toPrimitive) return () => ''
          if (key === Symbol.iterator) return function* () {}
          if (key === Symbol.asyncIterator) return async function* () {}
          if (key === Symbol.hasInstance) return () => false
          if (key === 'then') return undefined
          if (key === 'prototype') return target.prototype
          if (key === 'toString' || key === 'valueOf') return () => ''
          if (key === 'length') return 0
          return proxy
        },
        apply: () => proxy,
        construct: () => proxy,
        set: () => true,
        has: () => false,
        defineProperty: () => true,
        deleteProperty: () => true,
      })
      return proxy
    })()
    const real = {
      ...Object.fromEntries(R.realModules.map((m, i) => [m.key, modules[i][m.export]])),
      [R.windowImport]: (e) => (e ? (e.nodeType === 9 ? e : e.ownerDocument)?.defaultView ?? null : null),
      [R.elementImport]: (e) => (e?.nodeType === 1 ? e : null),
    }
    const resolved = new Map()
    for (const [local, { from, name }] of imports) {
      const key = `${from.replace(/^\.\//, '').replace(/-[\w-]{8}\.js$/, '')}:${name}`
      resolved.set(local, key in real ? real[key] : stub)
    }
    const store = new Map()
    const scope = new Proxy(Object.create(null), {
      has: (_t, key) => key !== '__scope' && typeof key === 'string',
      get(_t, key) {
        if (key === Symbol.unscopables) return undefined
        if (store.has(key)) return store.get(key)
        if (resolved.has(key)) return resolved.get(key)
        if (key === '__importMeta') return { url: location.href, env: {} }
        if (key in globalThis) {
          const v = globalThis[key]
          return typeof v === 'function' && /^[a-z]/.test(key) ? v.bind(globalThis) : v
        }
        return stub
      },
      set(_t, key, value) {
        store.set(key, value)
        return true
      },
    })
    const wanted = ['ou', 'au', 'cd', 'Gc', 'na', 'Nu', 'wm', 'ai']
    const grab = wanted.map((n) => `${n}:typeof ${n}==="undefined"?undefined:${n}`).join(',')
    // eslint-disable-next-line no-new-func
    const app = new Function('__scope', `with(__scope){${body}\n;return {${grab}}}`)(scope)
    const missing = wanted.filter((n) => app[n] === undefined)
    if (missing.length) throw new Error(`renderer chunk changed: not found ${missing.join(', ')}`)

    const site = document.querySelector('[data-engine-site]')
    const outer = document.querySelector('[data-lab-outer]')
    const host = document.querySelector('[data-plugin-drawn]')
    const root = app.cd(host, '') // shadow root + the app's engine CSS; a Pane has no surface CSS of its own
    const handlers = { press: () => undefined, input: () => undefined, select: () => undefined }

    // --- Size, as the app measures it -----------------------------------------------------------------------------
    const cell = () => app.ai(site) // 1ch by 1lh in the site
    const fit = () => {
      const c = cell()
      const rows = Math.max(1, Math.floor(outer.clientHeight / c.height) - 2)
      site.style.maxHeight = `${rows * c.height}px`
      const cs = getComputedStyle(site)
      const inner = site.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      return { bodyColumns: Math.max(1, Math.floor(inner / c.width)), bodyRows: rows }
    }

    // --- Talking to the lab server ----------------------------------------------------------------------------------
    let busy = Promise.resolve()
    let pending = 0
    const status = () => (document.documentElement.dataset.labBusy = String(pending))
    const send = (path, payload) => {
      pending++
      status()
      busy = busy.then(async () => {
        const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        const out = await res.json()
        // As the app: an act after which the mod asked for no redraw leaves the old drawing up.
        if (out.tree && out.redraw !== false) draw(out.tree, out.clients)
        else if (out.tree) document.documentElement.dataset.labStale = String(Number(document.documentElement.dataset.labStale || 0) + 1)
        say(`${out.error ? 'ERROR\n' + out.error : ''}last: ${JSON.stringify(payload.act ?? 'reset')}\n${out.ms} ms\n${(out.log ?? []).slice(-12).join('\n')}`)
        window.LAB_LAST = out
      }).catch((err) => say(String(err))).finally(() => {
        pending--
        status()
      })
      return busy
    }
    const act = (a) => send('/act', { act: { t: now(), ...a } })
    window.LAB = { act, reset: (setup) => send('/reset', { ...fit(), ...(setup ? { setup } : {}) }), idle: () => busy, root }

    // --- Drawing ----------------------------------------------------------------------------------------------------
    const draw = (tree, clients) => {
      const keep = site.scrollTop
      root.querySelector('[data-engine-tree]')?.remove()
      const marks = app.au()
      const drawn = app.ou(app.wm(tree), handlers, app.na, marks, app.Nu(host), true)
      if (drawn) {
        drawn.setAttribute('data-engine-tree', '')
        if (!drawn.matches('a[href],button,input,select,textarea')) drawn.setAttribute('tabindex', '-1')
        root.insertBefore(drawn, root.children[1] ?? null)
      }
      app.Gc(root, marks.hoverRules)
      for (const h of root.querySelectorAll('[data-client-key]')) client(h, clients?.[h.getAttribute('data-client-key')])
      site.scrollTop = keep
      window.LAB_DRAWS = (window.LAB_DRAWS ?? 0) + 1
    }

    // A Client as the app holds one: its host (al) takes a div with the frame's style (ic) that hears the pointer.
    // The app keeps a Client's frame across redraws (the instance lives while its key stays in the tree), so the lab
    // keeps one div per key and moves it into each new host: a fresh div under a resting pointer would say "enter"
    // on every redraw.
    const frames = new Map()
    const client = (hostEl, inner) => {
      const key = hostEl.getAttribute('data-client-key')
      // What the module drew goes in the frame, as in the app: the frame is only as tall as that.
      const fill = (frame) => {
        frame.replaceChildren()
        if (!inner) return
        const d = app.ou(app.wm(inner), handlers, app.na, app.au(), app.Nu(host), true)
        if (d) frame.appendChild(d)
      }
      const kept = frames.get(key)
      if (kept) {
        fill(kept)
        hostEl.replaceChildren(kept)
        return
      }
      const s = document.createElement('div')
      frames.set(key, s)
      s.setAttribute('data-lab-client', key)
      s.setAttribute('style', 'display:flex;flex-direction:column;min-width:0;min-height:1lh;outline:none;touch-action:none;contain:layout paint;--engine-row-unit:1lh')
      fill(s)
      hostEl.replaceChildren(s)
      const at = (e) => {
        const c = app.ai(s)
        const r = s.getBoundingClientRect()
        return { x: Math.floor((e.clientX - r.left) / c.width), y: Math.floor((e.clientY - r.top) / c.height) }
      }
      const size = () => {
        const c = app.ai(s)
        const r = s.getBoundingClientRect()
        return { columns: Math.max(0, Math.floor(r.width / c.width)), rows: Math.max(0, Math.floor(r.height / c.height)) }
      }
      requestAnimationFrame(() => {
        const z = size()
        if (z.columns !== Number(s.dataset.columns) || z.rows !== Number(s.dataset.rows)) {
          if (!clientSizes.has(key) || clientSizes.get(key) !== `${z.columns}x${z.rows}`) {
            clientSizes.set(key, `${z.columns}x${z.rows}`)
            act({ kind: 'resize', in: key, columns: z.columns, rows: z.rows })
          }
        }
      })
      let held = false
      let lastMove = 0
      // Moving the kept div into a new host makes the browser say enter again under a resting pointer; the app's frame
      // is never moved, so only a real crossing counts.
      let inside = false
      s.addEventListener('pointerenter', (e) => {
        if (inside) return
        inside = true
        act({ kind: 'pointer', in: key, type: 'enter', ...at(e) })
      })
      s.addEventListener('pointerleave', (e) => {
        if (held || !s.isConnected) return
        const r = s.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) return
        inside = false
        act({ kind: 'pointer', in: key, type: 'leave', ...at(e) })
      })
      s.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        held = true
        try {
          s.setPointerCapture(e.pointerId)
        } catch {}
        act({ kind: 'pointer', in: key, type: 'down', button: 'left', ...at(e) })
      })
      s.addEventListener('pointermove', (e) => {
        if (!held) return
        // One move a frame at most, as the app sends them; the lab replays each, so keep them sparse.
        const t = performance.now()
        if (t - lastMove < 60) return
        lastMove = t
        act({ kind: 'pointer', in: key, type: 'move', button: 'left', ...at(e) })
      })
      s.addEventListener('pointerup', (e) => {
        if (!held) return
        held = false
        try {
          s.releasePointerCapture(e.pointerId)
        } catch {}
        act({ kind: 'pointer', in: key, type: 'up', button: 'left', ...at(e) })
      })
    }
    const clientSizes = new Map()

    // Presses and Enter, from the drawn DOM (the renderer marks each control with its key).
    root.addEventListener('click', (e) => {
      const b = e.composedPath().find((n) => n instanceof HTMLElement && n.matches?.('button[data-press-key]'))
      if (b) act({ kind: 'press', key: b.getAttribute('data-press-key') })
    })
    // A field is a form (data-held-key) in the app's renderer: Enter submits it.
    root.addEventListener(
      'submit',
      (e) => {
        const form = e.composedPath().find((n) => n instanceof HTMLFormElement)
        if (!form) return
        e.preventDefault()
        act({ kind: 'input', key: form.getAttribute('data-held-key'), text: form.querySelector('input')?.value ?? '' })
      },
      true,
    )

    await document.fonts.ready
    await window.LAB.reset()
    document.documentElement.dataset.labReady = '1'
  } catch (err) {
    console.error(err)
    say(String((err && err.stack) || err))
    document.documentElement.dataset.labReady = 'error'
  }
})()
