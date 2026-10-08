import type { ClientSurface, RenderElement } from 'claude-code'

// The agent panel's overview, drawn here rather than in the pane: the app holds a pane's drawing while a mouse button
// is down anywhere in it and paints it again only on release, but it redraws a Client on its own, so only a Client can
// slide the map under the hand. The hooks module draws the map's SVG (hooks/agents.tsx, mapSvg) and hands it over as
// props, moving and still; a drag slides the still one, and once the button comes up and the map has caught up, tells
// the hooks how far (as shares of the map), which move the camera and send a new map. A click that did not travel is a
// click: the hooks focus the node under it.
//
// The app reports the pointer in whole cells (about 8 px across, a line down), never between, so a map pinned to it
// moves in steps. The slide is drawn on a frame clock instead: it eases towards where the pointer is, led by the drag's
// speed since the last report but never past the half cell the pointer can really be in, so it glides between the
// steps and has nothing to pull back when the hand stops.
//
// Each frame moves a box, not the picture: one still map drawn oversized (a map's width of room on every side) sits in
// a box whose margins carry the slide. The app takes fractional margins (ch across, lines down), so the slide is finer
// than a cell, and the image is decoded once per drag instead of once per frame.
//
// The Svg is not in a Client's typed element table (ClientElements, where a missing name draws a fragment), so it is
// built by its tag; the desktop app's Client tree takes and draws one as it does a pane's.

type MapProps = { cols: number; rows: number; w: number; h: number; source: string; still: string; alt: string }
type Drag = {
  /** Where the button went down, px. */
  x: number
  y: number
  /** The pointer's travel at its last report, px, and when that came (ms on the frame clock). */
  tx: number
  ty: number
  at: number
  /** Its speed between the last two reports, px per ms. */
  vx: number
  vy: number
  /** The slide drawn now, px. */
  ox: number
  oy: number
  moved: boolean
  down: boolean
  /** Released and caught up: the pan is told, the slid map shown until the hooks' new map (this source) is replaced. */
  heldFor: string | null
  /** The last click that did not travel, for a double-click: when and where. */
  clickAt: number
  cx: number
  cy: number
}
type MapState = { drag: Drag }

const FRAME_MS = 16
/** How much of the gap to the target each frame closes. */
const EASE = 0.45
/** How long after the last report the lead keeps growing (the speed is stale after that). */
const LEAD_MS = 60
/** Close enough to stop drawing, px. */
const SETTLED = 0.4
/** A second click this soon (ms) and this near (px) is a double-click: zoom in there, out with shift. */
const DOUBLE_MS = 350
const DOUBLE_PX = 24

/** The newest props, for the frame clock (it outlives the call that started it). */
const latest: { props: MapProps | null } = { props: null }

/** Where the slide is heading now: the last report, led by the drag's speed, held within the reported cell. */
function target(d: Drag, now: number, cellX: number, cellY: number): [number, number] {
  if (!d.down) return [d.tx, d.ty]
  const lead = Math.min(now - d.at, LEAD_MS)
  const within = (v: number, half: number) => Math.max(-half, Math.min(half, v))
  return [d.tx + within(d.vx * lead, cellX / 2), d.ty + within(d.vy * lead, cellY / 2)]
}

/** The still map with a map's width and height of room on every side, for the box that slides it. */
function roomy(still: string, w: number, h: number): string {
  return still.replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*" viewBox="[^"]*"/, `<svg $1width="${3 * w}" height="${3 * h}" viewBox="${-w} ${-h} ${3 * w} ${3 * h}"`)
}
const roomyCache: { still: string; out: string } = { still: '', out: '' }

/** The frame clock: performance.now where the surface has it, else Date.now. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export default function AgentsMap(props: MapProps | null, s: ClientSurface<MapState>): RenderElement {
  const { Box } = s.elements
  if (s.state === undefined) {
    // Says it loaded, for the render log: whether the app runs this module at all.
    s.post({ hello: true })
    const d: Drag = { x: 0, y: 0, tx: 0, ty: 0, at: 0, vx: 0, vy: 0, ox: 0, oy: 0, moved: false, down: false, heldFor: null, clickAt: -Infinity, cx: 0, cy: 0 }
    // One frame clock for the instance: it draws only while the slide is still catching up.
    s.every(FRAME_MS, () => {
      if (!d.moved || d.heldFor !== null) return
      const p0 = latest.props
      const [gx, gy] = p0 ? target(d, now(), p0.w / Math.max(1, p0.cols), p0.h / Math.max(1, p0.rows)) : [d.tx, d.ty]
      const dx = gx - d.ox
      const dy = gy - d.oy
      if (Math.abs(dx) < SETTLED && Math.abs(dy) < SETTLED) {
        if (d.down) return
        // Released and caught up: draw the last bit exactly, and tell the hooks.
        d.ox = d.tx
        d.oy = d.ty
        const p = latest.props
        if (p) {
          d.heldFor = p.source
          s.post({ pan: [d.ox / p.w, d.oy / p.h] })
        }
        s.setState({ drag: d })
        return
      }
      // Released, it closes faster: the hand has let go, there is nothing left to follow.
      const k = d.down ? EASE : 0.6
      d.ox += dx * k
      d.oy += dy * k
      s.setState({ drag: d })
    })
    latest.props = props
    s.setState({ drag: d })
    return Box({ width: props?.cols ?? '100%', height: props?.rows ?? '100%' })
  }
  latest.props = props
  const d = s.state.drag
  // A new map from the hooks after a release has the drag in it: show that, from rest.
  if (!d.down && d.heldFor !== null && props && props.source !== d.heldFor) {
    Object.assign(d, { ox: 0, oy: 0, tx: 0, ty: 0, vx: 0, vy: 0, moved: false, heldFor: null })
  }
  // The listener is set on each call, so it reads this call's props (a later call replaces it).
  s.onPointer(e => {
    const p = props
    if (!p) return
    const pxX = p.w / Math.max(1, p.cols)
    const pxY = p.h / Math.max(1, p.rows)
    const x = (e.fine?.x ?? e.x + 0.5) * pxX
    const y = (e.fine?.y ?? e.y + 0.5) * pxY
    const t = now()
    if (e.type === 'down' && e.button === 'left') {
      Object.assign(d, { x, y, tx: 0, ty: 0, at: t, vx: 0, vy: 0, ox: 0, oy: 0, moved: false, down: true, heldFor: null })
    } else if (e.type === 'move' && d.down) {
      const tx = x - d.x
      const ty = y - d.y
      if (!d.moved && Math.abs(tx) + Math.abs(ty) < 4) return
      const dt = Math.max(1, t - d.at)
      // The speed from report to report, smoothed a little so one quick step does not throw the map.
      d.vx = d.moved ? d.vx * 0.4 + ((tx - d.tx) / dt) * 0.6 : 0
      d.vy = d.moved ? d.vy * 0.4 + ((ty - d.ty) / dt) * 0.6 : 0
      Object.assign(d, { tx, ty, at: t, moved: true })
    } else if (e.type === 'up' && d.down) {
      d.down = false
      if (!d.moved) {
        const double = t - d.clickAt < DOUBLE_MS && Math.abs(x - d.cx) + Math.abs(y - d.cy) < DOUBLE_PX
        s.post(double ? { zoom: [x / p.w, y / p.h], out: e.shift === true } : { click: [x / p.w, y / p.h] })
        Object.assign(d, { clickAt: double ? -Infinity : t, cx: x, cy: y })
      }
      // A drag is told once the slide has caught up (the frame clock), so the hooks' map lands where it stands.
    }
  })
  if (!props) return Box({ width: '100%', height: '100%' })
  if (!d.moved) {
    return Box({ width: props.cols, height: props.rows, overflow: 'hidden', children: h('Svg', { source: props.source, alt: props.alt, width: props.w, height: props.h }) })
  }
  if (roomyCache.still !== props.still) Object.assign(roomyCache, { still: props.still, out: roomy(props.still, props.w, props.h) })
  // The oversized map's box: a map's size up and left of the region, plus the slide, in cells (ch across, lines down).
  const cx = props.w / Math.max(1, props.cols)
  const cy = props.h / Math.max(1, props.rows)
  const ox = Math.max(-props.w, Math.min(props.w, d.ox))
  const oy = Math.max(-props.h, Math.min(props.h, d.oy))
  return Box({
    width: props.cols,
    height: props.rows,
    overflow: 'hidden',
    children: Box({
      // Its own size, three maps each way: the app draws an Svg at most 100% of its box, which would squeeze it.
      width: 3 * props.cols,
      height: 3 * props.rows,
      flexShrink: 0,
      marginLeft: +((ox - props.w) / cx).toFixed(3),
      marginTop: +((oy - props.h) / cy).toFixed(3),
      children: h('Svg', { source: roomyCache.out, alt: props.alt, width: 3 * props.w, height: 3 * props.h }),
    }),
  })
}
