import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../../', import.meta.url))
const src = fs.readFileSync(repo + '/hooks/register.tsx', 'utf8')
const grab = n => { const m = src.match(new RegExp('const ' + n + ' = `([^`]*)`')); if (!m) throw Error(n); return m[1] }
const uri = s => 'data:image/svg+xml,' + encodeURIComponent(s).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')
// ringSvg(72, BOG), as the plugin builds it
const c = 2 * Math.PI * 6, p = 72
const ring = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#a7c98f" stroke-opacity=".25" stroke-width="2.2"/><circle cx="8" cy="8" r="6" fill="none" stroke="#a7c98f" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/></svg>`
// The brand mark (brand/mark.svg). Every copy on the page gets its own mask and clip ids.
const markSvg = fs.readFileSync(repo + '/brand/mark.svg', 'utf8'), markInner = markSvg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')
let marks = 0
const mark = () => { const id = 'mk' + (marks++); return '<svg class="spark" viewBox="0 0 100 100" aria-hidden="true">' + markInner.split('em').join(id) + '</svg>' }
const favicon = fs.readFileSync(repo + '/brand/favicon.svg', 'utf8')
const github = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>'

// The hero: BRAND_SVG's own pieces (gradient, glow, light streaks, sparkles, fade), laid out for a wide card.
const sp = [[470,70,5,4.2,.3],[520,300,4,5.1,2.1],[560,150,3,3.8,1.2],[600,345,6,4.6,3.4],[640,60,4,5.4,.9],[690,250,5,4,2.7],[720,120,3,4.8,1.8],[760,330,7,5.8,4],[800,40,5,4.4,3],[830,200,9,3.6,.1],[860,300,4,4.9,1.5],[880,110,6,5.2,2.4],[910,360,5,4.1,.6],[935,60,8,4.7,3.7],[960,250,6,5.5,1.1],[985,150,4,3.9,2.9],[540,220,3,6,4.4],[740,190,4,5,.4],[905,230,3,4.3,3.2],[620,210,3,5.6,2.2]]
const still = [[505,110,4,.35],[585,280,3,.3],[655,140,5,.45],[705,370,4,.4],[775,90,6,.55],[815,270,4,.5],[845,150,3,.45],[895,300,6,.6],[925,190,4,.55],[950,95,3,.5],[975,330,5,.6],[640,330,3,.3],[870,40,4,.5]]
const star4 = (x, y, s) => { const i = s * .21; return `M${x} ${y-s} L${x+i} ${y-i} L${x+s} ${y} L${x+i} ${y+i} L${x} ${y+s} L${x-i} ${y+i} L${x-s} ${y} L${x-i} ${y-i} Z` }
const streaks = [[600,38,.04],[680,14,.05],[770,46,.05],[880,18,.04],[960,36,.05],[1040,14,.04]].map(([x,w,o]) => `<line x1="${x-70}" y1="420" x2="${x+70}" y2="-20" stroke="#fff" stroke-opacity="${o}" stroke-width="${w}"/>`).join("")
const heroArt = `<svg class="stars" viewBox="0 0 1000 600" preserveAspectRatio="xMaxYMid slice" aria-hidden="true"><style>.h-sp{fill:#fff;opacity:0;transform-box:fill-box;transform-origin:center;animation:h-gl 4s ease-in-out infinite}@keyframes h-gl{0%,50%,100%{opacity:0;transform:scale(0) rotate(0deg)}70%{opacity:.95;transform:scale(1) rotate(30deg)}90%{opacity:0;transform:scale(.2) rotate(60deg)}}</style>${sp.map(([x,y,s,d,dl]) => `<path class="h-sp" style="animation-duration:${d}s;animation-delay:${dl}s" d="${star4(x,y*1.5,s*1.1)}"/>`).join("")}${still.map(([x,y,s,o]) => `<path fill="#fff" fill-opacity="${o}" d="${star4(x,y*1.5,s)}"/>`).join("")}</svg>`
// What's new: releases.json at the repo root, newest first. Test releases made to try the update card are left out
// (their notes start with "A version "). The latest 10 show; the rest wait behind "Show all".
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const TEST_NOTES = ["Releases can skip the local install"]
const releases = JSON.parse(fs.readFileSync(repo + "/releases.json", "utf8")).filter(r => !/^A version /.test(r.note) && !TEST_NOTES.includes(r.note))
const row = r => `<li>${esc(r.note)} <small>${esc(r.version)} · <time datetime="${esc(r.date)}">${esc(r.date)}</time></small></li>`
const news = `<ol class="rel">${releases.slice(0, 10).map(row).join("")}</ol>` + (releases.length > 10 ? `<details class="more"><summary>Show all</summary><ol class="rel">${releases.slice(10).map(row).join("")}</ol></details>` : "")
const map = {
  __WHATSNEW__: news,
  __STARS__: heroArt, 
  __ART_BRAND__: uri(grab('BRAND_SVG')), __ART_FROST__: uri(grab('FROST_SVG')), __ART_SWAMP__: uri(grab('SWAMP_SVG')),
  __ART_EMBER__: uri(grab('EMBER_SVG')), __ART_DOWN__: uri(grab('DOWN_SVG')),
  __TYPESAFE__: uri(grab('TYPESAFE_MARK')), __CLAUDE__: uri(grab('CLAUDE_MARK')), __CLAUDE_ORANGE__: uri(grab('CLAUDE_MARK').replace(/#ffffff/g, '#d97757')), __RING__: uri(ring),
  __ICON__: uri(favicon), __GITHUB__: github,
}
let out = fs.readFileSync(new URL('./template.html', import.meta.url), 'utf8')
out = out.replace(/__SPARK__/g, mark)
for (const [k, v] of Object.entries(map)) out = out.split(k).join(v)
if (/__[A-Z_]+__/.test(out)) throw Error('left: ' + out.match(/__[A-Z_]+__/)[0])
fs.mkdirSync(repo + '/site', { recursive: true })
fs.writeFileSync(repo + '/site/index.html', out)
console.log('bytes', out.length)
