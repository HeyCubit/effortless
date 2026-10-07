# render-band

Renders the dashboard band above the prompt the way the Claude desktop app (Code tab) draws it, as a PNG, without
opening the app. Use it to check a visual change to the band before shipping it.

```
node tools/render-band/render.mjs --percent 45 --width 768 --glow --at 0
```

Prints the paths of the page, the PNG and a JSON of measured boxes (CSS px), all in `tools/render-band/out/`.

## How it stays faithful

1. **The tree comes from the real mod.** The script copies the mod to a temp folder, writes `dump.template.ts` into it
   as a test, and runs `claude plugin test` on the copy. The test drives the hooks (judge verdict, one turn, cache,
   context) and prints what the band returns for `AbovePrompt` on desktop. `hooks/` is never touched. `--glow` flips
   `HANDOFF_GLOW` in the copy only.
2. **The DOM and CSS come from the installed app.** `page.js` fetches the app's renderer chunk (the one containing
   `data-press-cue` and `--engine-band-line`), strips its imports and runs it with the app's other modules stubbed,
   except the design tokens and DOMPurify, which are imported for real. It then calls the app's own functions: the band's
   tree shaper, the shadow-root setup with the engine CSS and the band's surface CSS, and the element renderer. The page
   loads the app's three stylesheets and fonts from `ion-dist`, and nests the host in the same wrappers and classes the
   app uses.
3. **The app's zoom.** Chromium stores the app's page zoom as a level (`per_host_zoom_levels` in the app's
   `Preferences`). The script reads it (2.5 here, so a factor of 1.5774) and passes it to headless Chrome as the device
   scale factor. The PNG is in device pixels, like a screenshot of the app.

The script finds the renderer, the token module and the helper imports by content, not by file name. After an app
update it either keeps working or exits and says which of these it could not find.

## Options

| flag | default | |
|---|---|---|
| `--percent N` | 19 | context fill; Handoff turns primary and the glow appears from 30 |
| `--width N` | 768 | CSS px of the band slot (the composer column; 768 in a wide window) |
| `--glow` | off | render with `HANDOFF_GLOW = true` (temporary copy only) |
| `--at S` | live | freezes the CSS animations inside Svg leaves at S seconds, for repeatable shots (0 = start of the glow's pulse, the low point) |
| `--wait S` | 0 | let S seconds of real time pass before the shot: use it for animations that run once (an entrance), which `--at` cannot hold past their end |
| `--cache M` / `--cache off` | 59 | minutes left on a 1 h cache |
| `--effort E`, `--reason "..."` | medium | the judge's verdict (Haiku judge) |
| `--auto off`, `--fresh`, `--judging`, `--working` | | other states |
| `--density compact\|comfortable` | compact | the Code tab's CDS density (the reference screenshots match compact) |
| `--mode dark\|light` | dark | |
| `--zoom Z` | app | override the zoom factor (`1` = no zoom) |
| `--tree file.json` | | redraw a tree saved earlier (`out/*.tree.json`) without running the mod |
| `--serve [--port N]` | | keep a local server running and print the page URL (the page applies CSS zoom to match the app) |
| `--out file.html` | `out/band-<percent>-<width>[-glow].html` | |
| `--app <ion-dist>` / `--chrome <exe>` | auto | |

## Limits

- Headless Chrome is not the app's Electron build. Layout matches to about 1 device px; text antialiasing can differ a
  little.
- Interactive Svgs (`isInteractive`) go through the app's sandboxed iframe path using the real DOMPurify. The band uses
  none: every Svg there is a plain `<img>`, as in the app.
- Hover states, hover cards and the host's "Turn off" button (added only when the band root is a plain layout box) are
  not drawn.
- Needs the desktop app installed (Windows Store build), Chrome or Edge, and `claude` on PATH.
