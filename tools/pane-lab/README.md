# pane-lab

The agent pane as the Claude desktop app draws it, live in a browser and run by the real mod, so a change can be
seen, clicked, dragged and scrolled without the app.

```
node tools/pane-lab/lab.mjs --port 7360
```

Open `http://127.0.0.1:7360/?w=440&h=900` (w and h are the dock tile in CSS px). The page draws the pane with the
installed app's own renderer chunk and stylesheets (as `tools/render-band` does) inside the site the app gives a
Pane. Presses, Enter in a field and the pointer on a Client go to the server, which replays every act so far through
the real hooks under `claude plugin test` and draws the tree that comes back (about 0.7 s per act). `hooks/` is copied
fresh on each act, so an edit shows on the next one. The side column shows the last act, the replay time and errors
(a refused tree is shown there, not drawn).

## Driving it

```
node tools/pane-lab/drive.mjs tools/pane-lab/flows/glide.json --h 900
```

Opens the lab in headless Chrome at the app's zoom (device scale, so 1ch and 1lh match the app) and runs the steps
with real mouse, wheel and keyboard events, saving PNGs to `tools/pane-lab/out/`. Steps: `shot`, `click` (a button
by key), `clickAt` and `drag` (shares of a Client's box or the tile), `wheel`, `type` (+ `enter`), `wait`, `eval`. See
the header of `drive.mjs` and the flows in `flows/`.

## What is the app's and what is the lab's

- The app's: the element-to-DOM code, its CSS and tokens, the site's classes and native scroll, the Pane's tree
  shaping, a Client's host and its pointer-to-cell sums (read from `c95e4d2cf-*.js`, see `page.js`).
- The lab's: the dock tile around the site (a title row and a border), the replay engine (the test kit's engine, not
  a session), and the Client frame: the lab runs the mod's surface module through the kit, the app runs it in its
  own frame. That a Client loads in the app at all is not shown here.
- The engine's own `ui.scroll` answer is not replayed: the lab scrolls natively and never snaps back.
