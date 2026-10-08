import type { ClientSurface, RenderElement } from 'claude-code'

// The agent panel's overview takes the pointer here: a Client laid over the map image (hooks/agents.tsx draws the map).
// A drag pans, a click picks the node under it, and while the pointer is over the map the pane's wheel zooms it
// instead of scrolling (register.tsx's ui.scroll hook reads the hover). Positions go to the hooks module as shares of
// the region (0-1), since cells differ per surface; the hooks know the map's size and do the sums.
//
// A post can replace an undelivered one in the same frame, so a drag sends its total since the button went down, with
// the drag's number, never a step: a lost post loses nothing.

type MapState = { ready: true }

export default function AgentsMap(props: { cols?: number; rows?: number } | null, s: ClientSurface<MapState>): RenderElement {
  if (s.state === undefined) {
    let down: { x: number; y: number; moved: boolean } | null = null
    let drag = 0
    s.onPointer(e => {
      const w = Math.max(1, s.columns)
      const r = Math.max(1, s.rows)
      const x = e.fine?.x ?? e.x + 0.5
      const y = e.fine?.y ?? e.y + 0.5
      if (e.type === 'down') s.post({ down: [e.x, e.y, s.columns, s.rows] })
      if (e.type === 'enter') s.post({ hover: true, size: [s.columns, s.rows] })
      else if (e.type === 'leave' && !down) s.post({ hover: false })
      else if (e.type === 'down' && e.button === 'left') {
        down = { x, y, moved: false }
        drag += 1
      } else if (e.type === 'move' && down) {
        if (Math.abs(x - down.x) + Math.abs(y - down.y) > 0.6) down.moved = true
        if (down.moved) s.post({ drag, dx: (x - down.x) / w, dy: (y - down.y) / r })
      } else if (e.type === 'up' && down) {
        if (down.moved) s.post({ drag, dx: (x - down.x) / w, dy: (y - down.y) / r, end: true })
        else s.post({ click: [x / w, y / r] })
        down = null
      }
    })
    // Says it loaded, for the render log: whether the app runs this module at all.
    s.post({ hello: true })
    s.setState({ ready: true })
  }
  // The app's frame is only as tall as what is drawn here (it does not grow), so a share of nothing is one row: draw
  // a box of the map's own size, which the hooks pass as props.
  return s.elements.Box({ width: props?.cols ?? '100%', height: props?.rows ?? '100%' })
}
