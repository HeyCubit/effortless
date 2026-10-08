import type { ClientSurface, RenderElement } from 'claude-code'

// The agent panel's overview, drawn here rather than in the pane: the app holds a pane's drawing while a mouse button
// is down anywhere in it and paints it again only on release, but it redraws a Client on its own, so only a Client can
// slide the map under the hand. The hooks module draws the map's SVG (hooks/agents.tsx, mapSvg) and hands it over as
// props, moving and still; a drag slides the still one by the pointer's travel on every frame, and once the button
// comes up tells the hooks how far (as shares of the map), which move the camera and send a new map. A click that did
// not travel is a click: the hooks focus the node under it.
//
// The Svg is not in a Client's typed element table (ClientElements, where a missing name draws a fragment), so it is
// built by its tag; the desktop app's Client tree takes and draws one as it does a pane's.

type MapProps = { cols: number; rows: number; w: number; h: number; source: string; still: string; alt: string }
type Drag = { x: number; y: number; ox: number; oy: number; moved: boolean; down: boolean; heldFor: string | null }
type MapState = { drag: Drag }

/** The map moved by (ox, oy) px: its pan group's translate, shifted. */
function slid(source: string, ox: number, oy: number): string {
  return source.replace(/<g id="pan" transform="translate\((-?[\d.]+) (-?[\d.]+)\)">/, (_m, x: string, y: string) =>
    `<g id="pan" transform="translate(${(Number(x) + ox).toFixed(1)} ${(Number(y) + oy).toFixed(1)})">`)
}

export default function AgentsMap(props: MapProps | null, s: ClientSurface<MapState>): RenderElement {
  const { Box } = s.elements
  if (s.state === undefined) {
    // Says it loaded, for the render log: whether the app runs this module at all.
    s.post({ hello: true })
    s.setState({ drag: { x: 0, y: 0, ox: 0, oy: 0, moved: false, down: false, heldFor: null } })
    return Box({ width: props?.cols ?? '100%', height: props?.rows ?? '100%' })
  }
  const d = s.state.drag
  // A new map from the hooks after a release has the drag in it: show that, from rest.
  if (!d.down && d.heldFor !== null && props && props.source !== d.heldFor) {
    d.ox = 0
    d.oy = 0
    d.heldFor = null
  }
  // The listener is set on each call, so it reads this call's props (a later call replaces it).
  s.onPointer(e => {
    const p = props
    if (!p) return
    const pxX = p.w / Math.max(1, p.cols)
    const pxY = p.h / Math.max(1, p.rows)
    const x = (e.fine?.x ?? e.x + 0.5) * pxX
    const y = (e.fine?.y ?? e.y + 0.5) * pxY
    if (e.type === 'down' && e.button === 'left') {
      Object.assign(d, { x, y, ox: 0, oy: 0, moved: false, down: true, heldFor: null })
      s.setState({ drag: d })
    } else if (e.type === 'move' && d.down) {
      const ox = x - d.x
      const oy = y - d.y
      if (!d.moved && Math.abs(ox) + Math.abs(oy) < 4) return
      d.moved = true
      d.ox = ox
      d.oy = oy
      s.setState({ drag: d })
    } else if (e.type === 'up' && d.down) {
      d.down = false
      if (d.moved) {
        // Keep showing the slid map until the hooks send the one drawn there.
        d.heldFor = p.source
        s.post({ pan: [d.ox / p.w, d.oy / p.h] })
      } else s.post({ click: [x / p.w, y / p.h] })
      s.setState({ drag: d })
    }
  })
  if (!props) return Box({ width: '100%', height: '100%' })
  const sliding = d.down ? d.moved : d.heldFor !== null
  return Box({
    width: props.cols,
    height: props.rows,
    overflow: 'hidden',
    children: h('Svg', { source: sliding ? slid(props.still, d.ox, d.oy) : props.source, alt: props.alt, width: props.w, height: props.h }),
  })
}
