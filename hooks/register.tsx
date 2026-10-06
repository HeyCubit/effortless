import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort, ModelKey, Pick, Spent } from '../types'

// The ladders the two sliders walk, cheapest first.
export const MODELS: { key: ModelKey; label: string; long: string; id: string }[] = [
  { key: 'haiku', label: 'Haiku', long: 'Haiku 4.5', id: 'claude-haiku-4-5-20251001' },
  { key: 'sonnet', label: 'Sonnet', long: 'Sonnet 5.5', id: 'claude-sonnet-5-5' },
  { key: 'opus', label: 'Opus', long: 'Opus 5.5', id: 'claude-opus-5-5' },
  { key: 'fable', label: 'Fable', long: 'Fable 5.1', id: 'claude-fable-5-1' },
]
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
// What one token costs relative to an uncached input token, the same ratios on every Claude model. Measured over
// 80k requests of real Claude Code use, cache reads are about 76% of a session's cost, cache writes 16% and output 8%: effort
// mostly changes how many tool calls a prompt makes, not what one answer writes, so all four are counted.
const WEIGHT = { input: 1, write: 1.25, read: 0.1, out: 5 }
// Changing effort between two requests keeps the prompt cache on these models only. On Fable 5.1 and older Opus
// the next request rewrote 56-100% of the cache (measured), which costs more than any effort can save.
export const cacheSafe = (modelId: string) => /(opus|sonnet)-5-5/.test(modelId)
// The purple the effort in the footer is written in.
const ACCENT = '#a79cf7'
// The box behind the level while it is hovered: the grey of the app's own pills.
const HOVER_BOX = '#2b2b2f'
const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max' }

// Auto is two switches. `isAuto` is effort (the name stays: it is what the store and state hold);
// `isAutoModel` lets the judge suggest another model and starts off.
const isAuto = atom({ plugin: 'effortless', key: 'isAuto' } as const, true)
const JEV_TIMEOUT_MS = 3000
const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const EMPTY_SPENT: Spent = { prompts: 0, requests: 0, input: 0, write: 0, read: 0, out: 0, byEffort: {}, judge: { jev: 0, haiku: 0, custom: 0, ms: 0, tokens: 0 } }
const SWITCHED_MS = 2500
// The prompt cache lives this long after the last request read or wrote it. A response may say which lifetime its
// cache writes got (usage.cache_creation: ephemeral_1h / ephemeral_5m); until one does, 1 hour is assumed: 99% of
// the cache writes in 80k requests of real Claude Code use (289k of 292k) were 1 hour.
const CACHE_TTL = { '5m': 5 * 60_000, '1h': 60 * 60_000 } as const
const CACHE_TICK_MS = 15_000
// Under this much time left the countdown turns amber: send now, or pay to write the whole context again.
// Shown minutes at or under these turn the countdown yellow, then red: grey while there is time, yellow at 20, red at 5.
const CACHE_YELLOW_MIN = 20
const CACHE_RED_MIN = 5
const ICE = '#7cc4ff'
const YELLOW = '#e0a33a'
const RED = '#e5534b'
const isAutoModel = atom({ plugin: 'effortless', key: 'isAutoModel' } as const, false)
const pick = atom({ plugin: 'effortless', key: 'pick' } as const, null)
const isJudging = atom({ plugin: 'effortless', key: 'isJudging' } as const, false)
const suggestion = atom({ plugin: 'effortless', key: 'suggestion' } as const, null)
const appEffort = atom({ plugin: 'effortless', key: 'appEffort' } as const, null)
const model = atom({ plugin: 'effortless', key: 'model' } as const, null)
// The last change Auto made to the effort, shown for a moment as "Low → High" and then cleared.
const switched = atom({ plugin: 'effortless', key: 'switched' } as const, null)
// What the prompts Auto steered cost this session, measured, and what judging them took.
const saved = atom({ plugin: 'effortless', key: 'saved' } as const, EMPTY_SPENT)
// True while the session runs a model where Auto must not change effort (see cacheSafe).
const paused = atom({ plugin: 'effortless', key: 'paused' } as const, false)
// How long the main conversation's prompt cache stays warm, in whole minutes left: null before the first response,
// 0 once it has gone cold. Updated only when the minute changes, so the footer redraws once a minute at most.
const cacheLeft = atom({ plugin: 'effortless', key: 'cacheLeft' } as const, null)
const isCompacting = atom({ plugin: 'effortless', key: 'isCompacting' } as const, false)
// The person closed the cold band; it comes back the next time the cache goes cold.
const isColdHidden = atom({ plugin: 'effortless', key: 'isColdHidden' } as const, false)
// The setup guide above the prompt: which step it shows, or null when it is closed.
const setupStep = atom({ plugin: 'effortless', key: 'setupStep' } as const, null)
// The band above the prompt when the cache has gone cold: an icy gradient with snowflakes drifting down.
const FROST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="30" viewBox="0 0 360 30"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.f path{stroke:#e6f4ff;stroke-width:.9;stroke-linecap:round;fill:none}.f{opacity:0;animation-name:drift;animation-timing-function:linear;animation-iteration-count:infinite}@keyframes drift{0%{opacity:0;transform:translate(0,-8px) rotate(0deg)}15%{opacity:.85}85%{opacity:.85}100%{opacity:0;transform:translate(4px,10px) rotate(120deg)}}.g{animation:breathe 5s ease-in-out infinite}@keyframes breathe{0%,100%{opacity:.75}50%{opacity:1}}</style><defs><linearGradient id="ice" x1="0" x2="1"><stop offset="0" stop-color="#7cc4ff" stop-opacity="0"/><stop offset=".45" stop-color="#7cc4ff" stop-opacity=".16"/><stop offset="1" stop-color="#b9e2ff" stop-opacity=".45"/></linearGradient><linearGradient id="rime" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient><pattern id="grain" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#fff" fill-opacity=".08"/></pattern></defs><rect class="g" width="100%" height="30" rx="7" fill="url(#ice)"/><rect width="100%" height="30" rx="7" fill="url(#rime)"/><rect x="35%" width="65%" height="30" rx="7" fill="url(#grain)"/><svg x="14%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:7.0s;animation-delay:-0s"><g transform="translate(0 9)"><path d="M-0.00 -4.00L0.00 4.00M3.46 -2.00L-3.46 2.00M3.46 2.00L-3.46 -2.00M0.00 2.20L0.82 3.18M0.00 2.20L-0.82 3.18M-1.91 1.10L-2.34 2.30M-1.91 1.10L-3.17 0.88M-1.91 -1.10L-3.17 -0.88M-1.91 -1.10L-2.34 -2.30M-0.00 -2.20L-0.82 -3.18M-0.00 -2.20L0.82 -3.18M1.91 -1.10L2.34 -2.30M1.91 -1.10L3.17 -0.88M1.91 1.10L3.17 0.88M1.91 1.10L2.34 2.30"/></g></g></svg><svg x="27%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:9.0s;animation-delay:-2.5s"><g transform="translate(0 20)"><path d="M-0.00 -3.00L0.00 3.00M2.60 -1.50L-2.60 1.50M2.60 1.50L-2.60 -1.50M0.00 1.65L0.62 2.39M0.00 1.65L-0.62 2.39M-1.43 0.82L-1.76 1.73M-1.43 0.82L-2.37 0.66M-1.43 -0.83L-2.37 -0.66M-1.43 -0.83L-1.76 -1.73M-0.00 -1.65L-0.62 -2.39M-0.00 -1.65L0.62 -2.39M1.43 -0.83L1.76 -1.73M1.43 -0.83L2.37 -0.66M1.43 0.83L2.37 0.66M1.43 0.83L1.76 1.73"/></g></g></svg><svg x="39%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:8.0s;animation-delay:-4.1s"><g transform="translate(0 7)"><path d="M-0.00 -3.50L0.00 3.50M3.03 -1.75L-3.03 1.75M3.03 1.75L-3.03 -1.75M0.00 1.93L0.72 2.78M0.00 1.93L-0.72 2.78M-1.67 0.96L-2.05 2.01M-1.67 0.96L-2.77 0.77M-1.67 -0.96L-2.77 -0.77M-1.67 -0.96L-2.05 -2.01M-0.00 -1.93L-0.72 -2.78M-0.00 -1.93L0.72 -2.78M1.67 -0.96L2.05 -2.01M1.67 -0.96L2.77 -0.77M1.67 0.96L2.77 0.77M1.67 0.96L2.05 2.01"/></g></g></svg><svg x="50%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:10.0s;animation-delay:-1.2s"><g transform="translate(0 18)"><path d="M-0.00 -2.60L0.00 2.60M2.25 -1.30L-2.25 1.30M2.25 1.30L-2.25 -1.30M0.00 1.43L0.53 2.07M0.00 1.43L-0.53 2.07M-1.24 0.71L-1.52 1.50M-1.24 0.71L-2.06 0.57M-1.24 -0.72L-2.06 -0.57M-1.24 -0.72L-1.52 -1.50M-0.00 -1.43L-0.53 -2.07M-0.00 -1.43L0.53 -2.07M1.24 -0.72L1.52 -1.50M1.24 -0.72L2.06 -0.57M1.24 0.72L2.06 0.57M1.24 0.72L1.52 1.50"/></g></g></svg><svg x="61%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:7.5s;animation-delay:-3.3s"><g transform="translate(0 10)"><path d="M-0.00 -4.20L0.00 4.20M3.64 -2.10L-3.64 2.10M3.64 2.10L-3.64 -2.10M0.00 2.31L0.86 3.34M0.00 2.31L-0.86 3.34M-2.00 1.16L-2.46 2.42M-2.00 1.16L-3.32 0.92M-2.00 -1.16L-3.32 -0.92M-2.00 -1.16L-2.46 -2.42M-0.00 -2.31L-0.86 -3.34M-0.00 -2.31L0.86 -3.34M2.00 -1.16L2.46 -2.42M2.00 -1.16L3.32 -0.92M2.00 1.16L3.32 0.92M2.00 1.16L2.46 2.42"/></g></g></svg><svg x="70%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:8.5s;animation-delay:-5.0s"><g transform="translate(0 21)"><path d="M-0.00 -3.00L0.00 3.00M2.60 -1.50L-2.60 1.50M2.60 1.50L-2.60 -1.50M0.00 1.65L0.62 2.39M0.00 1.65L-0.62 2.39M-1.43 0.82L-1.76 1.73M-1.43 0.82L-2.37 0.66M-1.43 -0.83L-2.37 -0.66M-1.43 -0.83L-1.76 -1.73M-0.00 -1.65L-0.62 -2.39M-0.00 -1.65L0.62 -2.39M1.43 -0.83L1.76 -1.73M1.43 -0.83L2.37 -0.66M1.43 0.83L2.37 0.66M1.43 0.83L1.76 1.73"/></g></g></svg><svg x="79%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:9.5s;animation-delay:-0.7s"><g transform="translate(0 8)"><path d="M-0.00 -3.40L0.00 3.40M2.94 -1.70L-2.94 1.70M2.94 1.70L-2.94 -1.70M0.00 1.87L0.70 2.70M0.00 1.87L-0.70 2.70M-1.62 0.93L-1.99 1.96M-1.62 0.93L-2.69 0.75M-1.62 -0.94L-2.69 -0.75M-1.62 -0.94L-1.99 -1.96M-0.00 -1.87L-0.70 -2.70M-0.00 -1.87L0.70 -2.70M1.62 -0.94L1.99 -1.96M1.62 -0.94L2.69 -0.75M1.62 0.94L2.69 0.75M1.62 0.94L1.99 1.96"/></g></g></svg><svg x="88%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:7.8s;animation-delay:-2.0s"><g transform="translate(0 17)"><path d="M-0.00 -4.00L0.00 4.00M3.46 -2.00L-3.46 2.00M3.46 2.00L-3.46 -2.00M0.00 2.20L0.82 3.18M0.00 2.20L-0.82 3.18M-1.91 1.10L-2.34 2.30M-1.91 1.10L-3.17 0.88M-1.91 -1.10L-3.17 -0.88M-1.91 -1.10L-2.34 -2.30M-0.00 -2.20L-0.82 -3.18M-0.00 -2.20L0.82 -3.18M1.91 -1.10L2.34 -2.30M1.91 -1.10L3.17 -0.88M1.91 1.10L3.17 0.88M1.91 1.10L2.34 2.30"/></g></g></svg><svg x="95%" y="0" width="1" height="30" overflow="visible"><g class="f" style="animation-duration:9.2s;animation-delay:-4.6s"><g transform="translate(0 9)"><path d="M-0.00 -2.80L0.00 2.80M2.42 -1.40L-2.42 1.40M2.42 1.40L-2.42 -1.40M0.00 1.54L0.58 2.23M0.00 1.54L-0.58 2.23M-1.33 0.77L-1.64 1.61M-1.33 0.77L-2.22 0.61M-1.33 -0.77L-2.22 -0.61M-1.33 -0.77L-1.64 -1.61M-0.00 -1.54L-0.58 -2.23M-0.00 -1.54L0.58 -2.23M1.33 -0.77L1.64 -1.61M1.33 -0.77L2.22 -0.61M1.33 0.77L2.22 0.61M1.33 0.77L1.64 1.61"/></g></g></svg></svg>`
const COLD_TOAST = '❄ effortless: this chat went cold. The next message re-reads all of it at full price. Staying here? Compact first (footer).'
// The decorations need a fixed width: the desktop app drops a band whose Svg has none.
const DECOR_WIDTH = 360
const SETTINGS_COMMAND = '/plugin configure effortless@effortless'
// The right of the setup guide, pure decoration (the name is on the left): a purple gradient with a soft glow,
// faint light streaks and grain, a still star, and small sparkles that twinkle in and out here and there. One constant source, so the app never rebuilds its frame (a changing source flickers); the
// motion is CSS inside it.
const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="30" viewBox="0 0 360 30"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.sp{fill:#fff;opacity:0;transform:scale(0);animation-name:gl;animation-timing-function:ease-in-out;animation-iteration-count:infinite}@keyframes gl{0%,72%,100%{opacity:0;transform:scale(0) rotate(0deg)}82%{opacity:.9;transform:scale(1) rotate(30deg)}92%{opacity:0;transform:scale(.2) rotate(60deg)}}</style><defs><linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="#7c6cf0" stop-opacity="0"/><stop offset=".5" stop-color="#7c6cf0" stop-opacity=".2"/><stop offset="1" stop-color="#8f7ff0" stop-opacity=".5"/></linearGradient><radialGradient id="glow" cx=".93" cy=".5" r=".35" fx=".93" fy=".5"><stop offset="0" stop-color="#c9bdff" stop-opacity=".45"/><stop offset=".5" stop-color="#9a86ff" stop-opacity=".12"/><stop offset="1" stop-color="#9a86ff" stop-opacity="0"/></radialGradient><pattern id="grain" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#fff" fill-opacity=".07"/></pattern><filter id="soft" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="1.8"/></filter></defs><rect width="100%" height="30" rx="7" fill="url(#bg)"/><rect width="100%" height="30" rx="7" fill="url(#glow)"/><rect x="40%" width="60%" height="30" rx="7" fill="url(#grain)"/><svg x="45%" y="0" width="1" height="30" overflow="visible"><line x1="0" y1="34" x2="20" y2="-4" stroke="#fff" stroke-opacity="0.05" stroke-width="5"/></svg><svg x="55%" y="0" width="1" height="30" overflow="visible"><line x1="0" y1="34" x2="20" y2="-4" stroke="#fff" stroke-opacity="0.04" stroke-width="2"/></svg><svg x="68%" y="0" width="1" height="30" overflow="visible"><line x1="0" y1="34" x2="20" y2="-4" stroke="#fff" stroke-opacity="0.06" stroke-width="8"/></svg><svg x="77%" y="0" width="1" height="30" overflow="visible"><line x1="0" y1="34" x2="20" y2="-4" stroke="#fff" stroke-opacity="0.04" stroke-width="2"/></svg><svg x="86%" y="0" width="1" height="30" overflow="visible"><line x1="0" y1="34" x2="20" y2="-4" stroke="#fff" stroke-opacity="0.05" stroke-width="4"/></svg><svg x="12%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 7px;animation-duration:4.2s;animation-delay:0.3s" d="M0 3.4 L0.76 6.24 L3.6 7 L0.76 7.76 L0 10.6 L-0.76 7.76 L-3.6 7 L-0.76 6.24 Z"/></svg><svg x="22%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 22px;animation-duration:5.1s;animation-delay:2.1s" d="M0 19 L0.63 21.37 L3 22 L0.63 22.63 L0 25 L-0.63 22.63 L-3 22 L-0.63 21.37 Z"/></svg><svg x="31%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 9px;animation-duration:3.8s;animation-delay:1.2s" d="M0 4.8 L0.88 8.12 L4.2 9 L0.88 9.88 L0 13.2 L-0.88 9.88 L-4.2 9 L-0.88 8.12 Z"/></svg><svg x="40%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 23px;animation-duration:4.6s;animation-delay:3.4s" d="M0 20 L0.63 22.37 L3 23 L0.63 23.63 L0 26 L-0.63 23.63 L-3 23 L-0.63 22.37 Z"/></svg><svg x="50%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 6px;animation-duration:5.4s;animation-delay:0.9s" d="M0 2.4 L0.76 5.24 L3.6 6 L0.76 6.76 L0 9.6 L-0.76 6.76 L-3.6 6 L-0.76 5.24 Z"/></svg><svg x="58%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 24px;animation-duration:4s;animation-delay:2.7s" d="M0 21 L0.63 23.37 L3 24 L0.63 24.63 L0 27 L-0.63 24.63 L-3 24 L-0.63 23.37 Z"/></svg><svg x="67%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 8px;animation-duration:4.8s;animation-delay:1.8s" d="M0 4.8 L0.67 7.33 L3.2 8 L0.67 8.67 L0 11.2 L-0.67 8.67 L-3.2 8 L-0.67 7.33 Z"/></svg><svg x="74%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 16px;animation-duration:5.8s;animation-delay:4s" d="M0 13.6 L0.50 15.50 L2.4 16 L0.50 16.50 L0 18.4 L-0.50 16.50 L-2.4 16 L-0.50 15.50 Z"/></svg><svg x="82%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 22px;animation-duration:3.6s;animation-delay:0.1s" d="M0 18.6 L0.71 21.29 L3.4 22 L0.71 22.71 L0 25.4 L-0.71 22.71 L-3.4 22 L-0.71 21.29 Z"/></svg><svg x="89%" y="0" width="1" height="30" overflow="visible"><path class="sp" style="transform-origin:0px 7px;animation-duration:4.4s;animation-delay:3s" d="M0 4.4 L0.55 6.45 L2.6 7 L0.55 7.55 L0 9.6 L-0.55 7.55 L-2.6 7 L-0.55 6.45 Z"/></svg><svg x="100%" y="0" width="1" height="30" overflow="visible"><g transform="translate(-30 0)"><path d="M0 7 L1.68 13.32 L8 15 L1.68 16.68 L0 23 L-1.68 16.68 L-8 15 L-1.68 13.32 Z" fill="#cfc4ff" filter="url(#soft)" opacity=".8"/><path d="M0 7 L1.68 13.32 L8 15 L1.68 16.68 L0 23 L-1.68 16.68 L-8 15 L-1.68 13.32 Z" fill="#fff"/></g></svg></svg>`

const JUDGE_SYSTEM = `You choose which Claude model and reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Pick the cheapest pair that will still do the job well.

Models, cheapest first:
- haiku: trivial questions, lookups, renames, one-line edits, chit-chat.
- sonnet: normal coding, edits across a few files, explanations, writing.
- opus: hard debugging, architecture, large refactors, careful reviews.
- fable: the hardest long-horizon or research-level work.

Effort: low for quick answers, medium for normal work, high for hard problems, xhigh or max only for very hard ones.

Effort is relative to the model in use ("Current" names it): a stronger model needs less effort for the same job. Opus at medium does about what Sonnet does at high, and Fable is stronger again. So for one and the same task pick one step lower on Opus than on Sonnet, and lower still on Fable; on Sonnet, go one step higher for hard work than you would on Opus.

Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "go through my whole drive and clean it up", "review the entire repo", "migrate everything" are big, multi-step, tool-heavy jobs where mistakes are costly: never low, usually high. Low is only for answers that need no tools and no planning.

If the message answers a question in the assistant's last reply (picks an option, says which one, confirms a plan), judge only the work that answer starts, as the reply describes it, not the length of the answer and not the work done before the question: "B" can mean "build the complicated section B" (high), while "yes" or "no" to one small action ("should I archive this?", "delete the old ones too?") is low, and picking a value for one setting (a log level, a colour, a font) is low. But picking which way to build something ("option 1", "the same shapes", "B") starts that build: judge the build. Approving a whole plan or several steps takes the effort of that plan.

Thanks, praise or a closing remark with no new request is low. A question about how to do something, or about effort itself, that needs no tools is low.

If the person asks for deep thought ("think hard", "ultrathink", "be thorough"), pick at least high; if they ask for a quick answer, pick low.

If the message is a short follow-up to ongoing work ("yes", "go", "ok", "continue", or the same in any language), keep the current pair.

Reply with JSON only: {"model":"haiku|sonnet|opus|fable","effort":"low|medium|high|xhigh|max","why":"at most 6 words, in the user's language"}`

/** Reads `{ model, effort, why }` out of a reply, or nothing when it doesn't hold one. */
export function parseVerdict(text: string): { model: ModelKey; effort: Effort; why: string } | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(match[0])
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const { model, effort, why } = raw as Record<string, unknown>
  const key = typeof model === 'string' ? model.toLowerCase() : ''
  const found = MODELS.find(m => key === m.key || key === m.id || key.includes(m.key))
  if (!found || !EFFORTS.includes(effort as Effort)) return undefined
  return { model: found.key, effort: effort as Effort, why: typeof why === 'string' ? why.slice(0, 60) : '' }
}

/**
 * What the judge reads besides the new message: the person's previous message and the assistant's last reply. The
 * reply is kept long and from its end, where a question with options ("A, B or C?") sits: "B" alone looks like a
 * small job, the reply says what B sets off.
 */
async function recentContext($: EngineInterface): Promise<string> {
  return contextFrom(await $.session.messages())
}

/** The context text from the conversation so far: the last user message, short, and the assistant's last reply's end. */
export function contextFrom(messages: readonly { role: string; text: string }[]): string {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  const lastAssistant = lastAssistantText(messages)
  return [lastUser ? `user: ${lastUser.text.slice(0, 400)}` : '', lastAssistant ? `assistant: ${lastAssistant.slice(-2000)}` : '']
    .filter(Boolean)
    .join('\n')
}

/** The assistant's last reply, or nothing. */
function lastAssistantText(messages: readonly { role: string; text: string }[]): string {
  return [...messages].reverse().find(m => m.role === 'assistant' && m.text.trim())?.text ?? ''
}


// Jev answers typed questions with probabilities; these are the options it picks between.
const JEV_EFFORTS: Record<Effort, string> = {
  low: 'quick answer, no tools, no planning',
  medium: 'normal work: a few tool calls or edits',
  high: 'hard or large multi-step job: many tool calls, costly mistakes',
  xhigh: 'very hard: a long investigation',
  max: 'the hardest research-level work',
}
const JEV_MODELS: Record<ModelKey, string> = {
  haiku: 'trivial questions, lookups, renames, chit-chat',
  sonnet: 'normal coding, edits across a few files, explanations, writing',
  opus: 'hard debugging, architecture, large refactors, careful reviews',
  fable: 'the hardest long-horizon or research-level work',
}
const JEV_TASK =
  'Choose the reasoning effort (and model) an agentic assistant should use for the next user message. It reads files, ' +
  'runs tools and edits things, not only code. Pick the cheapest that still does the job well. Judge the scope and the ' +
  'amount of work, not whether it is code: "go through my whole drive and clean it up" is a big tool-heavy job. ' +
  'Effort is relative to current_model: a stronger model needs less for the same job. Opus at medium does about what ' +
  'Sonnet does at high, so for one task pick one step lower on Opus than on Sonnet. ' +
  'A short follow-up ("yes", "go", "ok", in any language) keeps the current effort. When the message answers a ' +
  "question in the assistant's last reply (picks an option), judge only the work that answer starts, not its length and " +
  'not the work before the question: yes/no to one small action, or picking a value for one setting (a log level, a colour), is low; picking which way to build something starts that build, so judge the build; ' +
  'approving a whole plan takes the effort of that plan. Thanks or a closing remark with no new request is low. A ' +
  'question about how to do something that needs no tools is low. "think hard", "ultrathink" or "be thorough" means ' +
  'at least high; "quick question" means low.'

/** A short follow-up such as "go", "ok", "yes", "continue": two words and a dozen characters at most. */
export function isFollowUp(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length <= 12 && t.split(/\s+/).length <= 2
}

/**
 * Whether the assistant's last reply ended on a question ("Should I archive it?", "A, B or C?"). A short message
 * after one answers it, and the answer can start a small or a big job, so it goes to the judge instead of keeping
 * the effort.
 */
export function endsOnQuestion(context: string): boolean {
  const reply = context.split('\nassistant: ').pop() ?? ''
  return context.includes('assistant: ') && reply.slice(-400).includes('?')
}

/** The message as the judge reads it: images and files it carries are named, since the judge sees only text. */
export function withAttachments(text: string, attachments?: readonly { type: string }[]): string {
  if (!attachments?.length) return text
  const counts = new Map<string, number>()
  for (const a of attachments) counts.set(a.type, (counts.get(a.type) ?? 0) + 1)
  const said = [...counts].map(([type, n]) => `${n} ${type}${n > 1 ? 's' : ''}`).join(', ')
  return `${text}

[The message comes with ${said} to look at.]`
}

/** A short follow-up that keeps the current effort: "go" between two steps, not an answer to a question. */
export function keepsEffort(message: string, context: string): boolean {
  return isFollowUp(message) && !endsOnQuestion(context)
}

/** The TypeSafe key in a ~/.config/jev/.env file's text, the same file the jev-* skills read. */
export function parseJevKey(text: string): string | undefined {
  const value = text.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].replace(/^['"]|['"]$/g, '')
  return value || undefined
}

/**
 * Jev's answer as a verdict. Below even odds on the effort it is unsure, and an unsure call keeps the
 * current effort: that is what a "go" between two steps of work should do.
 */
const UNSURE = 'unsure, keeping'
export function parseJevAnswer(text: string, current: Pick | null): { model: ModelKey; effort: Effort; why: string } | undefined {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text)
  } catch {
    return undefined
  }
  const answers = (json.answers ?? (json.result as Record<string, unknown> | undefined)?.answers) as
    | Record<string, { choice?: string; confidence?: number; probabilities?: Record<string, number> }>
    | undefined
  const effort = answers?.effort?.choice as Effort | undefined
  if (!effort || !EFFORTS.includes(effort)) return undefined
  const model = MODELS.find(m => m.key === answers?.model?.choice)?.key ?? current?.model ?? 'sonnet'
  const sure = answers?.effort?.confidence ?? answers?.effort?.probabilities?.[effort]
  if (current && typeof sure === 'number' && sure < 0.5) return { model, effort: current.effort, why: UNSURE }
  return { model, effort, why: typeof sure === 'number' ? `${Math.round(sure * 100)}% sure` : '' }
}

let askJevFile: EnvAsk
/**
 * The TypeSafe key: from the settings, else TYPESAFE_API_KEY. Only when the person picked the jev judge outright is
 * ~/.config/jev/.env read as well: a mod should not open a file holding a secret it was not asked to use.
 */
async function jevKey($: EngineInterface): Promise<string | undefined> {
  if (config.typesafeKey) return config.typesafeKey
  const fromEnv = await envJevKey($)
  if (fromEnv) return fromEnv
  if (config.judge !== 'jev') return undefined
  askJevFile =
    askJevFile ??
    (async () => {
      const home = (await envUserProfile($)) ?? (await envHome($))
      if (!home) return undefined
      const text = await $.fs.read(`${home}/.config/jev/.env`).catch(() => '')
      return parseJevKey(typeof text === 'string' ? text : '')
    })()
  return askJevFile
}

type Judged = { verdict?: Pick; tokens: number }

/** Why a judge the person picked could not answer, in words: what a status code means for them. */
export function judgeFailure(name: string, status: number | 'timeout'): string {
  if (status === 'timeout') return `${name} did not answer in time`
  if (status === 401 || status === 403) return `${name} rejected the key (HTTP ${status})`
  if (status === 402 || status === 429) return `${name} is out of credits or rate limited (HTTP ${status})`
  return `${name} failed (HTTP ${status})`
}
const warned = new Set<string>()
/** Tells the person once per session and reason that their judge failed and Haiku stands in. */
function warnJudge($: EngineInterface, reason: string) {
  void proof($, `judge fallback: ${reason}`)
  if (warned.has(reason)) return
  warned.add(reason)
  $.ui.toast(`effortless: ${reason}. Haiku judges for now.`)
}

/** Which judge the person picked in the plugin's settings, and what it needs. */
export type JudgeConfig = {
  judge: 'auto' | 'haiku' | 'jev' | 'custom'
  typesafeKey: string
  customUrl: string
  customModel: string
  customKey: string
}
let config: JudgeConfig = { judge: 'auto', typesafeKey: '', customUrl: '', customModel: '', customKey: '' }

/** The settings as the engine hands them over (defaults filled in), cleaned to the shape the judge reads. */
export function readConfig(options: unknown): JudgeConfig {
  const o = (options ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const picked = str(o.judge)
  return {
    judge: picked === 'haiku' || picked === 'jev' || picked === 'custom' ? picked : 'auto',
    typesafeKey: str(o.typesafeKey),
    customUrl: str(o.customUrl),
    customModel: str(o.customModel),
    customKey: str(o.customKey),
  }
}

/** The text the judge reads: the current pair, the last turns and the next message. */
function judgeQuestion(prompt: string, current: Pick | null, context: string): string {
  return [
    current ? `Current: ${current.model} / ${current.effort}` : 'Current: none',
    context ? `Recent conversation:\n${context}` : '',
    `Next message:\n${prompt.slice(0, 2000)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Reads the verdict out of an OpenAI-compatible chat completion. */
export function parseChatCompletion(text: string): ReturnType<typeof parseVerdict> {
  try {
    const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content
    return typeof content === 'string' ? parseVerdict(content) : undefined
  } catch {
    return undefined
  }
}

/** A judge the person brought: any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, a local Ollama, ...). */
async function askCustom($: EngineInterface, prompt: string, current: Pick | null, context: string): Promise<Judged | undefined> {
  if (!config.customUrl) return undefined
  try {
    const res = await Promise.race([
      $.http.fetch(config.customUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.customKey ? { authorization: `Bearer ${config.customKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.customModel || undefined,
          temperature: 0,
          max_tokens: 120,
          messages: [
            { role: 'system', content: JUDGE_SYSTEM },
            { role: 'user', content: judgeQuestion(prompt, current, context) },
          ],
        }),
      }),
      $.clock.sleep(JEV_TIMEOUT_MS).then(() => {
        throw new Error('custom judge timeout')
      }),
    ])
    if (!res.ok) warnJudge($, judgeFailure('Your judge', res.status))
    const verdict = res.ok ? parseChatCompletion(res.text) : undefined
    if (!verdict) return undefined
    let used = 0
    try {
      const usage = (JSON.parse(res.text) as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
      used = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)
    } catch {
      // No usage in the reply: counted as 0.
    }
    return { verdict: { ...verdict, by: 'custom' }, tokens: used }
  } catch (error) {
    warnJudge($, String(error).includes('timeout') ? judgeFailure('Your judge', 'timeout') : 'Your judge could not be reached')
    return undefined
  }
}

/**
 * Asks the judge picked in the settings: a custom endpoint, Jev (with a TypeSafe key), or Haiku. "auto" asks Jev
 * when a key is found and Haiku otherwise. Any judge that fails or takes longer than JEV_TIMEOUT_MS falls back to
 * Haiku, which needs nothing but the session's own login. Never throws.
 */
async function judge($: EngineInterface, prompt: string, current: Pick | null): Promise<Judged> {
  const context = await recentContext($).catch(() => '')
  if (config.judge === 'custom') {
    const custom = await askCustom($, prompt, current, context)
    if (custom) return custom
  }
  const key = config.judge === 'auto' || config.judge === 'jev' ? await jevKey($).catch(() => undefined) : undefined
  if (key) {
    const jev = await askJev($, key, prompt, current, context)
    if (jev) return jev.verdict?.why === UNSURE ? haikuAfter($, jev, prompt, current, context) : jev
  }
  return askHaiku($, prompt, current, context)
}

/** Jev was unsure: Haiku makes the call, and both judges' tokens count. */
async function haikuAfter($: EngineInterface, jev: Judged, prompt: string, current: Pick | null, context: string): Promise<Judged> {
  const haiku = await askHaiku($, prompt, current, context)
  return haiku.verdict ? { verdict: haiku.verdict, tokens: haiku.tokens + jev.tokens } : jev
}

/** Jev on TypeSafe: an answer, or nothing when it fails, is unsure of its own format or takes too long. */
async function askJev($: EngineInterface, key: string, prompt: string, current: Pick | null, context: string): Promise<Judged | undefined> {
  try {
    // A stalled endpoint must not hold the prompt: after JEV_TIMEOUT_MS the judge falls through to Haiku.
    const res = await Promise.race([
      $.http.fetch((await envJevUrl($)) ?? JEV_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'jev-latest',
          state: {
            task: JEV_TASK,
            current_model: current?.model ?? null,
            current_effort: current?.effort ?? null,
            recent_conversation: context,
            next_message: prompt.slice(0, 4000),
          },
          questions: {
            effort: { type: 'choice', instructions: 'Which effort fits the next message?', criteria: JEV_EFFORTS },
            model: { type: 'choice', instructions: 'Which model fits the next message?', criteria: JEV_MODELS },
          },
        }),
      }),
      $.clock.sleep(JEV_TIMEOUT_MS).then(() => {
        throw new Error('jev timeout')
      }),
    ])
    if (!res.ok) warnJudge($, judgeFailure('Jev', res.status))
    const verdict = res.ok ? parseJevAnswer(res.text, current) : undefined
    if (verdict) {
      let used = 0
      try {
        const usage = (JSON.parse(res.text) as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
        used = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
      } catch {
        // No usage in the reply: counted as 0.
      }
      return { verdict: { ...verdict, by: 'jev' }, tokens: used }
    }
  } catch (error) {
    // Jev down or slow: fall through to Haiku, and say so.
    warnJudge($, String(error).includes('timeout') ? judgeFailure('Jev', 'timeout') : 'Jev could not be reached')
  }
  return undefined
}

/** Haiku through the session's own login: the judge that needs no key, and the fallback for the others. */
async function askHaiku($: EngineInterface, prompt: string, current: Pick | null, context: string): Promise<Judged> {
  const asked = judgeQuestion(prompt, current, context)
  const r = await $.model.complete({
    model: 'haiku',
    system: JUDGE_SYSTEM,
    prompt: asked,
    maxTokens: 120,
    effort: 'low',
    timeoutMs: 6000,
  })
  const verdict = r.isAnswered ? parseVerdict(r.text) : undefined
  const tokens = r.isAnswered && r.usage ? r.usage.input_tokens + r.usage.output_tokens : 0
  return { verdict: verdict && { ...verdict, by: 'haiku' }, tokens }
}

// The judge benchmark (/effortless bench): labelled prompts in bench/judge-cases.json, each run through the same
// pipeline a real prompt takes (a short follow-up keeps the current effort, anything else goes to a judge).
export type BenchCase = { id: string; kind: string; holdout?: boolean; current: Pick; context?: string; message: string; ok: Effort[] }
export type BenchAnswer = { id: string; judge: string; effort?: Effort; by?: string; why?: string; ms: number; tokens: number }

/** Where an answer lands against the labels: right, too low (risks quality), too high (wastes), or no answer. */
export function benchGrade(c: BenchCase, effort: Effort | undefined): 'hit' | 'under' | 'over' | 'none' {
  if (!effort) return 'none'
  if (c.ok.includes(effort)) return 'hit'
  const rank = EFFORTS.indexOf(effort)
  return rank < Math.min(...c.ok.map(e => EFFORTS.indexOf(e))) ? 'under' : 'over'
}

/** The benchmark's table: per judge the share it got right, how it missed, and how fast it was; then per kind. */
export function benchReport(cases: BenchCase[], answers: BenchAnswer[]): string {
  const byId = new Map(cases.map(c => [c.id, c]))
  const judges = [...new Set(answers.map(a => a.judge))]
  const kinds = [...new Set(cases.map(c => c.kind))]
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '-')
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }
  const lines = ['| Judge | Right | Too low | Too high | No answer | Median ms |', '| --- | --- | --- | --- | --- | --- |']
  for (const j of judges) {
    const mine = answers.filter(a => a.judge === j)
    const g = mine.map(a => benchGrade(byId.get(a.id)!, a.effort))
    const n = (k: string) => g.filter(x => x === k).length
    const asked = mine.filter(a => a.ms > 0).map(a => a.ms)
    lines.push(`| ${j} | ${pct(n('hit'), g.length)} | ${n('under')} | ${n('over')} | ${n('none')} | ${asked.length ? median(asked) : '-'} |`)
  }
  // The held-out cases were never tuned against: the honest score. The rest shaped the judge prompts.
  const sets = [
    ['tuned on', cases.filter(c => !c.holdout)],
    ['held out', cases.filter(c => c.holdout)],
  ] as const
  lines.push('', `| Set (cases) | ${judges.join(' | ')} |`, `| --- | ${judges.map(() => '---').join(' | ')} |`)
  for (const [name, set] of sets) {
    if (!set.length) continue
    const ids = set.map(c => c.id)
    const cells = judges.map(j => {
      const mine = answers.filter(a => a.judge === j && ids.includes(a.id))
      return pct(mine.filter(a => benchGrade(byId.get(a.id)!, a.effort) === 'hit').length, mine.length)
    })
    lines.push(`| ${name} (${set.length}) | ${cells.join(' | ')} |`)
  }
  lines.push('', `| Kind (cases) | ${judges.join(' | ')} |`, `| --- | ${judges.map(() => '---').join(' | ')} |`)
  for (const k of kinds) {
    const ids = cases.filter(c => c.kind === k).map(c => c.id)
    const cells = judges.map(j => {
      const mine = answers.filter(a => a.judge === j && ids.includes(a.id))
      return pct(mine.filter(a => benchGrade(byId.get(a.id)!, a.effort) === 'hit').length, mine.length)
    })
    lines.push(`| ${k} (${ids.length}) | ${cells.join(' | ')} |`)
  }
  const misses = answers
    .filter(a => !a.judge.startsWith('always') && benchGrade(byId.get(a.id)!, a.effort) !== 'hit')
    .map(a => `- ${a.judge}${a.by && a.by !== a.judge ? ` (via ${a.by})` : ''} ${a.id}: said ${a.effort ?? 'nothing'}${a.why ? ` (${a.why})` : ''}, wanted ${byId.get(a.id)!.ok.join('/')}: "${byId.get(a.id)!.message.slice(0, 60)}"`)
  return [...lines, '', 'Misses:', ...(misses.length ? misses : ['- none'])].join('\n')
}

/** Runs every case through each available judge, a few at a time, and returns the answers. */
async function runBench($: EngineInterface, cases: BenchCase[]): Promise<BenchAnswer[]> {
  const key = await typesafeKeyAnywhere($).catch(() => undefined)
  const judges: [string, (c: BenchCase) => Promise<Judged | undefined>][] = [
    ['haiku', c => askHaiku($, c.message, c.current, c.context ?? '')],
  ]
  if (key)
    judges.push([
      'jev',
      async c => {
        const jev = await askJev($, key, c.message, c.current, c.context ?? '')
        if (!jev) return askHaiku($, c.message, c.current, c.context ?? '')
        return jev.verdict?.why === UNSURE ? haikuAfter($, jev, c.message, c.current, c.context ?? '') : jev
      },
    ])
  if (config.customUrl) judges.push(['custom', c => askCustom($, c.message, c.current, c.context ?? '')])
  const answers: BenchAnswer[] = []
  // Baselines: what a fixed effort would score on the same labels.
  for (const fixed of ['medium', 'high'] as Effort[])
    for (const c of cases) answers.push({ id: c.id, judge: `always ${fixed}`, effort: fixed, ms: 0, tokens: 0 })
  const jobs = judges.flatMap(([name, ask]) => cases.map(c => ({ name, ask, c })))
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const { name, ask, c } = jobs[next++]
      // The mod never asks a judge about a short follow-up: it keeps the current effort.
      if (keepsEffort(c.message, c.context ?? '')) {
        answers.push({ id: c.id, judge: name, effort: c.current.effort, ms: 0, tokens: 0 })
        continue
      }
      const started = await $.clock.now()
      const got = await ask(c).catch(() => undefined)
      answers.push({ id: c.id, judge: name, effort: got?.verdict?.effort, by: got?.verdict?.by, why: got?.verdict?.why, ms: (await $.clock.now()) - started, tokens: got?.tokens ?? 0 })
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return answers
}

function keyOf(id: string): ModelKey | undefined {
  return MODELS.find(m => id.includes(m.key))?.key
}

/** Records the model the session now runs; the pick follows it, so the band never shows a stale one. */
async function modelIs($: EngineInterface, id: string) {
  const pause = !cacheSafe(id) && keyOf(id) !== 'haiku'
  if (pause !== (await read($, paused))) await update($, paused, () => pause)
  const key = keyOf(id)
  if (!key || key === (await read($, model))) return
  await update($, model, () => key)
  // The engine's effort can differ per model, so a change across a switch is not the person's doing;
  // and a model turned down earlier may be suggested again.
  engineEffort = undefined
  declined = null
  const current = await read($, pick)
  if (current && current.model !== key) await choose($, { ...current, model: key })
  if ((await read($, suggestion)) === key) await update($, suggestion, () => null)
}

async function sessionModel($: EngineInterface): Promise<ModelKey> {
  const id = await $.session.model()
  return MODELS.find(m => id.includes(m.key))?.key ?? 'sonnet'
}


// Proof log: every verdict, /effort and request effort, written to EFFORTLESS_LOG, or to
// %TEMP%/effortless-proof.log while the mod is loaded from a dev-mods folder. Off otherwise.
const proofLines: string[] = []
// An environment variable does not change while the session runs, so each one is asked for once. The
// engine wants the name spelled out in every $.env.get call, hence one small getter per variable.
type EnvAsk = Promise<string | undefined> | undefined
let askLog: EnvAsk
let askTemp: EnvAsk
let askTmpdir: EnvAsk
let askModelUi: EnvAsk
let askJevUrl: EnvAsk
let askJevKey: EnvAsk
let askUserProfile: EnvAsk
let askHome: EnvAsk
const envLog = ($: EngineInterface) => (askLog = askLog ?? $.env.get('EFFORTLESS_LOG'))
const envTemp = ($: EngineInterface) => (askTemp = askTemp ?? $.env.get('TEMP'))
const envTmpdir = ($: EngineInterface) => (askTmpdir = askTmpdir ?? $.env.get('TMPDIR'))
const envModelUi = ($: EngineInterface) => (askModelUi = askModelUi ?? $.env.get('EFFORTLESS_MODEL_UI'))
const envJevUrl = ($: EngineInterface) => (askJevUrl = askJevUrl ?? $.env.get('JEV_URL'))
const envJevKey = ($: EngineInterface) => (askJevKey = askJevKey ?? $.env.get('TYPESAFE_API_KEY'))
const envUserProfile = ($: EngineInterface) => (askUserProfile = askUserProfile ?? $.env.get('USERPROFILE'))
const envHome = ($: EngineInterface) => (askHome = askHome ?? $.env.get('HOME'))

async function proofPath($: EngineInterface): Promise<string | undefined> {
  const named = await envLog($)
  if (named) return named
  if (!$.plugin.root.replace(/\\/g, '/').includes('/dev-mods/')) return undefined
  const tmp = (await envTemp($)) ?? (await envTmpdir($)) ?? '/tmp'
  return `${tmp}/effortless-proof.log`
}
async function proof($: EngineInterface, line: string) {
  const path = await proofPath($).catch(() => undefined)
  if (!path) return
  proofLines.push(`${new Date().toISOString()} ${line}`)
  await $.fs.write(path, proofLines.slice(-200).join('\n') + '\n').catch(() => undefined)
}

// The effort the engine itself last asked for on the main loop (the app's setting; this mod only
// rewrites the request, never the setting). It changing means the person set it (the app's Effort
// control, their own /effort): that wins and Auto goes off.
let engineEffort: string | undefined
// The slash command this mod last typed into the prompt box.
let lastTyped = ''
// The toast about pressing Enter is shown once; on every click it is only noise.
let toldAboutEnter = false
let lastFooter = ''
// A model the person turned down; not suggested again until they pick something else.
let declined: ModelKey | null = null

/**
 * Types a slash command into the prompt box for the person to send with Enter. A command the person
 * sends is read by the app itself, so its own Model and Effort controls follow; one the mod runs
 * inside the engine is not. Never overwrites a draft: returns false when the box is not empty.
 */
async function typeCommand($: EngineInterface, text: string): Promise<boolean> {
  try {
    const draft = (await $.prompt.read()).text.trim()
    // A draft of your own is never overwritten; the mod's own earlier command is replaced.
    if (draft !== '' && draft !== lastTyped) return false
    const filled = await $.prompt.fill({ text })
    if (filled.isFilled) lastTyped = text
    if (filled.isFilled && !toldAboutEnter) {
      toldAboutEnter = true
      $.ui.toast(`Press Enter to send ${text} so the app's own control follows`)
    }
    return filled.isFilled
  } catch {
    return false
  }
}

/** A model change reloads the context, so it only happens when the person says yes. */
async function switchModel($: EngineInterface, model: ModelKey) {
  try {
    await $.command.run({ command: 'model', args: model })
    declined = null
    await update($, suggestion, () => null)
    const current = await read($, pick)
    if (current) await choose($, { ...current, model })
  } catch {
    $.ui.toast('Could not switch the model right now')
  }
}

/**
 * The tally in its current shape. A hot reload keeps the state an older version wrote ({ requests, actual,
 * baseline } before 0.2.0), so every read goes through this.
 */
export function asSpent(t: unknown): Spent {
  const v = (t ?? {}) as Partial<Spent>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  const judged = (v.judge ?? {}) as Partial<Spent['judge']>
  return {
    prompts: num(v.prompts),
    requests: num(v.requests),
    input: num(v.input),
    write: num(v.write),
    read: num(v.read),
    out: num(v.out),
    byEffort: v.byEffort && typeof v.byEffort === 'object' ? v.byEffort : {},
    judge: { jev: num(judged.jev), haiku: num(judged.haiku), custom: num(judged.custom), ms: num(judged.ms), tokens: num(judged.tokens) },
  }
}

/** Adds one request Auto steered: every kind of token it used, under the effort it ran at. */
async function tally(
  $: EngineInterface,
  effort: Effort,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
) {
  const cached = usage.cache_read_input_tokens ?? 0
  const write = usage.cache_creation_input_tokens ?? 0
  const cost = usage.input_tokens * WEIGHT.input + write * WEIGHT.write + cached * WEIGHT.read + usage.output_tokens * WEIGHT.out
  await update($, saved, old => {
    const t = asSpent(old)
    const bucket = t.byEffort[effort] ?? { prompts: 0, cost: 0 }
    return {
      ...t,
      requests: t.requests + 1,
      input: t.input + usage.input_tokens,
      write: t.write + write,
      read: t.read + cached,
      out: t.out + usage.output_tokens,
      byEffort: { ...t.byEffort, [effort]: { ...bucket, cost: bucket.cost + cost } },
    }
  })
}

/** Counts one prompt Auto judged: under its effort, and what the judge took. */
async function countPrompt($: EngineInterface, effort: Effort | undefined, by: Pick['by'] | undefined, ms: number, judgeTokens: number) {
  await update($, saved, old => {
    const t = asSpent(old)
    const judged = {
      jev: t.judge.jev + (by === 'jev' ? 1 : 0),
      haiku: t.judge.haiku + (by === 'haiku' ? 1 : 0),
      custom: t.judge.custom + (by === 'custom' ? 1 : 0),
      ms: t.judge.ms + ms,
      tokens: t.judge.tokens + judgeTokens,
    }
    if (!effort) return { ...t, judge: judged }
    const bucket = t.byEffort[effort] ?? { prompts: 0, cost: 0 }
    return { ...t, judge: judged, prompts: t.prompts + 1, byEffort: { ...t.byEffort, [effort]: { ...bucket, prompts: bucket.prompts + 1 } } }
  })
}

/** The cache lifetime a response's writes got, when it says; nothing when it wrote nothing or does not say. */
export function cacheTtlOf(usage: unknown): keyof typeof CACHE_TTL | undefined {
  const c = (usage as { cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } } | null)
    ?.cache_creation
  if ((c?.ephemeral_1h_input_tokens ?? 0) > 0) return '1h'
  if ((c?.ephemeral_5m_input_tokens ?? 0) > 0) return '5m'
  return undefined
}

/** Most of the prompt came from the cache: it was still warm. */
export function mostlyCached(usage: unknown): boolean {
  const u = (usage ?? {}) as { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  const read_ = u.cache_read_input_tokens ?? 0
  const all = read_ + (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return all > 0 && read_ / all > 0.5
}

/** The countdown's colour for whole minutes left (rounded up, as cacheMinutes gives): none (grey), yellow or red. */
export function cacheColor(minutesLeft: number): string | undefined {
  const shown = minutesLeft - 1
  if (minutesLeft <= 0) return ICE
  if (shown > CACHE_YELLOW_MIN) return undefined
  return shown <= CACHE_RED_MIN ? RED : YELLOW
}

/** The footer's words for the time left: "58m", "<1m", or "Cold". */
export function cacheLabel(minutesLeft: number): string {
  if (minutesLeft <= 0) return '❄ Cold'
  if (minutesLeft === 1) return '<1m'
  return `${minutesLeft - 1}m`
}

let cacheTtl: keyof typeof CACHE_TTL = '1h'
let cacheExpires = 0
/** Writes the minutes left when they changed; the session's one timer (started in session.start) calls it. */
async function showCache($: EngineInterface) {
  if (cacheExpires === 0) return
  const minutes = await cacheMinutes($)
  const was = await read($, cacheLeft)
  if (minutes === was) return
  await update($, cacheLeft, () => minutes)
  // Going cold or warm adds or removes the band above the prompt; the desktop app redraws that site only when asked.
  if ((minutes === 0) !== (was === 0)) $.ui.invalidate('ui.render')
  // The band above the prompt is not drawn on every surface (desktop draws none at present), so a toast says it too.
  if (minutes === 0 && was !== 0) $.ui.toast(COLD_TOAST)
}

/** Minutes left, rounded up, so "1" means under a minute and 0 means cold. */
async function cacheMinutes($: EngineInterface): Promise<number> {
  const left = cacheExpires - (await $.clock.now())
  return left <= 0 ? 0 : Math.ceil(left / 60_000)
}

/** A response came back: the cache is warm again for its whole lifetime, and the countdown restarts. */
let usageLogged = false
let lastResponseAt: number | undefined
async function cacheTouched($: EngineInterface, usage: unknown) {
  const now = await $.clock.now()
  if (!usageLogged) {
    usageLogged = true
    void proof($, `first response usage: ${JSON.stringify(usage)}`)
  }
  // When the response does not say, the cache tells by itself: read back after more than 5 minutes means 1 hour.
  const ttl = cacheTtlOf(usage) ?? (lastResponseAt !== undefined && now - lastResponseAt > CACHE_TTL['5m'] && mostlyCached(usage) ? '1h' : undefined)
  lastResponseAt = now
  if (ttl && ttl !== cacheTtl) {
    cacheTtl = ttl
    void proof($, `cache lifetime ${ttl}`)
  }
  cacheExpires = now + CACHE_TTL[cacheTtl]
  if (await read($, isColdHidden)) await update($, isColdHidden, () => false)
  await showCache($)
}

/**
 * Compacts the conversation from the footer once the cache has gone cold: the next message would write the whole
 * context to the cache again, so a summary makes it small first. The countdown hides until the next response.
 */
async function compactCold($: EngineInterface) {
  if (await read($, isCompacting)) return
  await update($, isCompacting, () => true)
  try {
    const result = await $.session.compact()
    if (!result?.skip) {
      cacheExpires = 0
      await update($, cacheLeft, () => null)
    }
  } catch {
    $.ui.toast("Can't compact while Claude is working")
  } finally {
    await update($, isCompacting, () => false)
  }
}

/** A TypeSafe key the jev judge would use: the settings, TYPESAFE_API_KEY, or ~/.config/jev/.env (Jev was picked). */
async function findTypesafeKey($: EngineInterface): Promise<boolean> {
  return Boolean(await typesafeKeyAnywhere($))
}

/** The TypeSafe key from the settings, TYPESAFE_API_KEY or ~/.config/jev/.env, for a step the person asked for. */
async function typesafeKeyAnywhere($: EngineInterface): Promise<string | undefined> {
  const known = config.typesafeKey || (await envJevKey($))
  if (known) return known
  const home = (await envUserProfile($)) ?? (await envHome($))
  if (!home) return undefined
  const text = await $.fs.read(`${home}/.config/jev/.env`).catch(() => '')
  return parseJevKey(typeof text === 'string' ? text : '')
}

/** Closes the guide for good: it does not open by itself again. */
async function finishSetup($: EngineInterface, said?: string) {
  await Promise.all([update($, setupStep, () => null), $.store.set('setupDone', true)])
  if (said) $.ui.toast(said)
}

/** The person picked a judge in the guide: it is saved as the plugin's setting, and the next step shown. */
async function pickJudge($: EngineInterface, choice: 'haiku' | 'jev' | 'custom') {
  await $.config.set({ key: 'effortless.judge', value: choice }).catch(() => undefined)
  if (choice === 'haiku') return finishSetup($, 'effortless: Haiku judges, no key needed. /effortless setup changes it.')
  if (choice === 'jev' && (await findTypesafeKey($))) return finishSetup($, 'effortless: Jev judges with the TypeSafe key it found.')
  await update($, setupStep, () => choice)
}

/** 1234 -> "1.2k", 87 -> "87". */
function tokens(n: number): string {
  const v = Math.abs(n)
  const text = v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
  return n < 0 ? `-${text}` : text
}

const share = (part: number, whole: number) => `${Math.round((part / whole) * 100)} %`

/**
 * What /effortless stats answers: what the prompts Auto steered cost, measured, split by kind and by effort,
 * and what the judge took. No "saved" figure: what a prompt would have cost at another effort is not known,
 * since effort mostly changes how many tool calls it makes. Cost is in tokens weighted as priced (WEIGHT).
 */
export function savedText(raw: Spent): string {
  const t = asSpent(raw)
  const judged = t.judge.jev + t.judge.haiku + t.judge.custom
  if (t.prompts === 0 && judged === 0) return 'nothing measured yet'
  const input = t.input * WEIGHT.input
  const write = t.write * WEIGHT.write
  const cached = t.read * WEIGHT.read
  const out = t.out * WEIGHT.out
  const total = input + write + cached + out
  const lines = [
    `${t.prompts} prompts, ${t.requests} requests, cost about ${tokens(Math.round(total))} tokens weighted by price` +
      (total > 0 ? ` (cache reads ${share(cached, total)}, cache writes ${share(write, total)}, output ${share(out, total)})` : ''),
  ]
  const per = EFFORTS.filter(e => t.byEffort[e]?.prompts).map(e => {
    const b = t.byEffort[e]!
    return `${EFFORT_LABELS[e]} ${b.prompts}, average ${tokens(Math.round(b.cost / b.prompts))}`
  })
  if (per.length) lines.push(`Per prompt: ${per.join('; ')}`)
  if (judged) {
    lines.push(`Judge: Jev ${t.judge.jev}, Haiku ${t.judge.haiku}, custom ${t.judge.custom}, average ${Math.round(t.judge.ms / judged)} ms, ${tokens(t.judge.tokens)} tokens in all`)
  }
  return lines.join('\n')
}

/** You picked an effort (terminal rows): Auto for effort goes off and the requests follow; Enter on /effort moves the app. */
async function pickEffort($: EngineInterface, level: Effort) {
  const t0 = Date.now()
  const inUse = (await read($, model)) ?? (await sessionModel($))
  const t1 = Date.now()
  // Together, so the app redraws once for the click and not once per write.
  await Promise.all([
    update($, isAuto, () => false),
    $.store.set('isAuto', false),
    choose($, { model: inUse, effort: level, why: 'your pick', by: 'manual' }),
  ])
  const t2 = Date.now()
  await typeCommand($, `/effort ${level}`)
  const t3 = Date.now()
  void proof($, `click ${level}: ${t3 - t0} ms (read ${t1 - t0}, state ${t2 - t1}, typed command ${t3 - t2})`)
}

async function toggleAutoEffort($: EngineInterface) {
  const turnOn = !(await read($, isAuto))
  await update($, isAuto, () => turnOn)
  await $.store.set('isAuto', turnOn)
}

async function choose($: EngineInterface, next: Pick | null) {
  const before = await read($, pick)
  await Promise.all([update($, pick, () => next), $.store.set('pick', next)])
  // A change Auto made is shown as "Low → High" for a moment, so the switch is seen.
  if (next && next.by !== 'manual' && before && before.model !== 'haiku' && before.effort !== next.effort) {
    const change = { from: before.effort, to: next.effort }
    await update($, switched, () => change)
    $.clock.after(SWITCHED_MS, () => void update($, switched, () => null))
  }
}

/** Everything a redraw needs, read together: the reads go out at once instead of one after the other. */
async function snap($: EngineInterface) {
  const [auto, autoModel, current, judging, wanted, shownByApp, modelNow, switchedNow, pausedNow, cacheNow, compacting] = await Promise.all([
    read($, isAuto),
    read($, isAutoModel),
    read($, pick),
    read($, isJudging),
    read($, suggestion),
    read($, appEffort),
    read($, model),
    read($, switched),
    read($, paused),
    read($, cacheLeft),
    read($, isCompacting),
  ])
  return { auto, autoModel, current, judging, wanted, shownByApp, modelNow, switchedNow, pausedNow, cacheNow, compacting }
}
type Snap = Awaited<ReturnType<typeof snap>>

/** The effort to show: yours or the judge's, else what the app itself runs with; none on Haiku. */
function effortOf(v: Snap, inUse: ModelKey): Effort | undefined {
  if (inUse === 'haiku') return undefined
  if (v.current) return v.current.effort
  return EFFORTS.includes(v.shownByApp as Effort) ? (v.shownByApp as Effort) : undefined
}

export const register: Register = (on, options) => {
  config = readConfig(options)
  on('session.start', async ($, e, next) => {
    const storedAuto = await $.store.get('isAuto')
    if (typeof storedAuto === 'boolean') await update($, isAuto, () => storedAuto)
    const storedAutoModel = await $.store.get('isAutoModel')
    if (typeof storedAutoModel === 'boolean') await update($, isAutoModel, () => storedAutoModel)
    // Auto off means the effort you chose should still be the one in force.
    const storedPick = (await $.store.get('pick')) as Pick | null
    if (storedAuto === false && storedPick && EFFORTS.includes(storedPick.effort)) {
      await update($, pick, () => storedPick)
    }
    // The cache countdown's clock. A timer started inside a request ends with that request, so it lives here.
    $.clock.every(CACHE_TICK_MS, () => void showCache($).catch(() => undefined))
    // The first time the mod runs, the setup guide opens above the prompt.
    if ((await $.store.get('setupDone')) !== true) await update($, setupStep, () => 'pick')
    // Clear the status entry older versions set.
    $.ui.status(undefined)
    await modelIs($, await $.session.model()).catch(() => undefined)
    await $.command.register({
      name: 'effortless',
      description: 'Setup: /effortless setup. Judge test: /effortless bench. Auto on/off: /effortless auto. What Auto cost: /effortless stats. Try Compact: /effortless cold.',
    })
    return next(e)
  })

  on('command.run', { command: 'effortless' }, async ($, e) => {
    const wanted = await read($, suggestion)
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto') {
      await toggleAutoEffort($)
      return { text: (await read($, isAuto)) ? 'Auto on: effort is picked for every prompt.' : 'Auto off: the effort is yours.' }
    }
    // A test aid: marks the cache cold now, so the Compact button can be tried without waiting out the hour.
    if (arg === 'setup') {
      await update($, setupStep, () => 'pick')
      $.ui.invalidate('ui.render')
      return { text: 'The effortless setup is open above the prompt.' }
    }
    if (arg === 'bench') {
      const cases = (JSON.parse(await $.fs.read(`${$.plugin.root}/bench/judge-cases.json`)) as { cases: BenchCase[] }).cases
      const answers = await runBench($, cases)
      const report = benchReport(cases, answers)
      const stamp = new Date(await $.clock.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const out = `effortless-bench-${stamp}`
      await $.fs.write(`${out}.json`, JSON.stringify({ cases: cases.length, answers }, null, 2))
      await $.fs.write(`${out}.md`, report)
      return { text: `${report}

Saved to ${out}.md and .json` }
    }
    if (arg === 'cold') {
      cacheExpires = await $.clock.now()
      await update($, cacheLeft, () => 0)
      $.ui.invalidate('ui.render')
      $.ui.toast(COLD_TOAST)
      return { text: 'The cache shows as cold now (a test). Compact is in the footer. The next response restarts the countdown.' }
    }
    if (arg === 'stats' || arg === 'saved') return { text: `Auto, this session:\n${savedText(await read($, saved))}` }
    if (!wanted) return { text: 'No model suggestion right now.' }
    if (arg === 'switch') {
      $.clock.after(0, () => void switchModel($, wanted))
      return { text: `Switching to ${wanted}. The context reloads.` }
    }
    declined = wanted
    await update($, suggestion, () => null)
    return { text: `Keeping the current model.` }
  })

  on('prompt.submit', async ($, e, next) => {
    const byPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    const wantsEffort = await read($, isAuto)
    const wantsModel = await read($, isAutoModel)
    if (!byPerson || e.text.trim().startsWith('/') || (!wantsEffort && !wantsModel)) return next(e)
    // On a model where an effort change rewrites the cache, Auto waits instead of judging.
    const modelId = await $.session.model()
    await modelIs($, modelId)
    if (!cacheSafe(modelId) && keyOf(modelId) !== 'haiku') return next(e)
    // "go", "ok", "yes" between two steps of work keep the effort Auto already chose; no judge is asked.
    const before = await read($, pick)
    // A message with an image is never a bare follow-up: "fix this" plus a screenshot is new work.
    const shown = withAttachments(e.text, e.attachments)
    if (wantsEffort && before && before.by !== 'manual' && !e.attachments?.length && isFollowUp(e.text) && keepsEffort(e.text, await recentContext($).catch(() => ''))) {
      await countPrompt($, before.effort, undefined, 0, 0)
      void proof($, `follow-up "${e.text.trim()}": keeping ${before.effort}`)
      return next(e)
    }

    await update($, isJudging, () => true)
    try {
      const inUse = await sessionModel($)
      const startedAt = Date.now()
      const { verdict, tokens: judgeTokens } = await judge($, shown, {
        model: inUse,
        effort: (await read($, pick))?.effort ?? 'medium',
        why: '',
        by: 'manual',
      })
      const ms = Date.now() - startedAt
      await countPrompt($, wantsEffort && inUse !== 'haiku' ? verdict?.effort : undefined, verdict?.by, ms, judgeTokens)
      void proof(
        $,
        verdict
          ? `judged by ${verdict.by} in ${ms} ms: ${verdict.model}/${verdict.effort} (${verdict.why}) for "${e.text.slice(0, 50)}"`
          : `no verdict after ${ms} ms for "${e.text.slice(0, 50)}"`,
      )
      if (verdict) {
        // Effort follows the verdict at once, when Auto is on for effort. The model stays: switching it
        // reloads the context, so with Auto on for model it is only suggested.
        if (wantsEffort) {
          const applied: Pick = { ...verdict, model: inUse }
          await choose($, applied)
        }
        if (wantsModel && verdict.model !== inUse && verdict.model !== declined) {
          await update($, suggestion, () => verdict.model)
          $.ui.toast(`Suggestion: switch to ${verdict.model}? /effortless switch or /effortless keep`)
        } else if (verdict.model === inUse) {
          await update($, suggestion, () => null)
        }
      }
    } finally {
      await update($, isJudging, () => false)
    }
    return next(e)
  })

  // In /config the custom judge's rows only show while the custom judge is picked.
  on('config.describe', async ($, e, next) => {
    const described = await next(e)
    if ((e.key === 'effortless.customUrl' || e.key === 'effortless.customModel') && config.judge !== 'custom') {
      return { ...described, isHidden: true }
    }
    return described
  })

  // A switch from anywhere (the app's picker, /model, a fallback) moves the pick at once.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await modelIs($, e.to_model)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    // Every main-conversation response, whatever its effort, keeps the cache warm for its lifetime from now.
    const send = async function* (request: typeof e) {
      const answer = yield* next(request)
      // Inside the hook ($ calls after it returns are refused), and never allowed to break the request.
      if (e.agentId === undefined && answer?.usage) await cacheTouched($, answer.usage).catch(() => undefined)
      return answer
    }
    if (e.agentId === undefined) await modelIs($, e.model)
    if (e.agentId === undefined && typeof e.effort === 'string') {
      const seen = e.effort
      const isFirst = engineEffort === undefined
      const isByPerson = !isFirst && seen !== engineEffort
      engineEffort = seen
      // The first effort seen is the app's setting; a change the mod did not make is the person's.
      if (isFirst || isByPerson) await update($, appEffort, () => seen)
      if (isByPerson) {
        await update($, isAuto, () => false)
        await $.store.set('isAuto', false)
        await choose($, { model: await sessionModel($), effort: seen, why: 'your pick in the app', by: 'manual' })
        void proof($, `request ${e.index}: you set effort ${seen} yourself, Auto off`)
        return yield* send(e)
      }
    }
    const p = e.agentId === undefined ? await read($, pick) : null
    // Haiku takes no effort: decided by the model this request names, never by a stored pick.
    if (!p || keyOf(e.model) === 'haiku' || !cacheSafe(e.model)) return yield* send(e)
    if (e.agentId === undefined) void proof($, `request ${e.index} (${e.model}): effort ${e.effort ?? 'none'} -> ${p.effort}`)
    const result = yield* send({ ...e, effort: p.effort })
    // Only requests Auto steered count.
    if (e.agentId === undefined && p.by !== 'manual' && result.usage) {
      await tally($, p.effort, result.usage)
      void proof(
        $,
        `response ${e.index} at ${p.effort}: ${result.usage.output_tokens} out, ${result.usage.cache_read_input_tokens ?? 0} cache read, ${result.usage.cache_creation_input_tokens ?? 0} cache write`,
      )
    }
    return result
  })

  // The only desktop UI: the effort in use, as purple text in the prompt footer, under the chat box, and a small
  // button that switches Auto off and on. A Button cannot be coloured and the footer draws no outline or tint, so
  // plain Text is what is purple. While the judge decides it says "Deciding…", for a moment after Auto switches the level it says
  // "Low → High", and while Auto is off it says "Off" in the dim colour. Auto is switched with /effortless auto.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await snap($)
    const effortNow = effortOf(v, v.modelNow ?? 'sonnet')
    const label = v.judging
      ? 'Deciding…'
      : v.switchedNow
        ? `${EFFORT_LABELS[v.switchedNow.from]} → ${EFFORT_LABELS[v.switchedNow.to]}`
        : effortNow
          ? EFFORT_LABELS[effortNow]
          : 'Auto'
    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        {e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')}</Text> : null}
        {/* Hovering the level puts a box behind it, like the app's own effort pill. The spaces are its padding:
            Text has no padding of its own. */}
        {v.auto && v.pausedNow ? (
          // Fable and older models: an effort change rewrites the cache there, so Auto waits.
          <Text dimColor hover={{ scope: 'effort', backgroundColor: HOVER_BOX }}>
            {' Paused '}
          </Text>
        ) : v.auto ? (
          <Text color={ACCENT} bold hover={{ scope: 'effort', backgroundColor: HOVER_BOX }}>
            {` ${label} `}
          </Text>
        ) : (
          <Text dimColor hover={{ scope: 'effort', backgroundColor: HOVER_BOX }}>
            {' Off '}
          </Text>
        )}
        {/* The one thing to click: it switches Auto off and on. Text cannot be clicked, so it is a small button. */}
        <Button key="auto" plain dimColor label=" ⏻ " hover={{ scope: 'power', backgroundColor: HOVER_BOX }} onPress={() => toggleAutoEffort($)} />
        {/* How long the prompt cache stays warm: grey, yellow from 20 minutes, red from 5, then "cold" (the next message
            writes the whole context again). Nothing before the first response. */}
        {/* Cold: one click compacts, so the next message does not write the whole context again. "Cold" is the button's
            own label: the footer draws every button before any text, so a separate word would sit apart from it. */}
        {v.cacheNow === 0 ? (
          <Button key="compact" dimColor label={v.compacting ? 'Compacting…' : `${cacheLabel(0)} · Compact`} onPress={() => compactCold($)} />
        ) : v.cacheNow === null ? null : cacheColor(v.cacheNow) ? (
          <Text color={cacheColor(v.cacheNow)}>{cacheLabel(v.cacheNow)}</Text>
        ) : (
          <Text dimColor>{cacheLabel(v.cacheNow)}</Text>
        )}
      </Box>
    )
  })

  // Above the prompt: the terminal's rows (effort steps, Auto, and the model row when it is switched on).
  // On desktop nothing is drawn here, except the question when the judge suggests another model.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    // The setup guide, one step at a time: pick a judge, then only what that judge needs.
    const step = await read($, setupStep)
    if (step) {
      const openSettings = () => typeCommand($, SETTINGS_COMMAND)
      // The decoration takes all the room left on the row, so it reaches the right edge at any width.
      const brand = (
        <Box key="brand" flexDirection="row" flexGrow={1} justifyContent="flex-end">
          <Svg source={BRAND_SVG} alt="effortless" width={DECOR_WIDTH} height={30} isInteractive />
        </Box>
      )
      // One row: the name, the question, the choices, and the decoration on the right.
      if (step === 'pick')
        return (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box flexShrink={0}>
              <Text color={ACCENT} bold wrap="truncate">
                ✦ effortless
              </Text>
            </Box>
            <Text wrap="truncate">Who picks the effort?</Text>
            <Button key="setup-jev" variant="primary" label="Jev (API)" onPress={() => pickJudge($, 'jev')} />
            <Button key="setup-haiku" label="Haiku (no key)" onPress={() => pickJudge($, 'haiku')} />
            <Button key="setup-later" label="⏎" onPress={() => finishSetup($)} />
            {brand}
          </Box>
        )
      const need =
        step === 'jev'
          ? 'Paste a TypeSafe key (typesafe.ai) in settings, then restart.'
          : 'Fill in URL, model and key in settings, then restart.'
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Box flexShrink={0}>
            <Text color={ACCENT} bold wrap="truncate">
              ✦ effortless
            </Text>
          </Box>
          <Text wrap="truncate">{need}</Text>
          <Button key="setup-open" variant="primary" label="Open settings" onPress={openSettings} />
          <Button
            key="setup-done"
            label="Done"
            onPress={() => finishSetup($, 'effortless: restart Claude Code so the new settings are used.')}
          />
          <Button key="setup-back" plain dimColor label="Back" onPress={() => update($, setupStep, () => 'pick')} />
          {brand}
        </Box>
      )
    }
    // The cache went cold: the next message writes the whole chat again at full price. Said where it cannot be missed.
    if ((await read($, cacheLeft)) === 0 && !(await read($, isColdHidden))) {
      const compacting = await read($, isCompacting)
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Box flexShrink={0}>
            <Text color={ICE} bold wrap="truncate">
              ❄ Chat went cold
            </Text>
          </Box>
          <Text wrap="truncate">The next message re-reads all of it at full price. Staying here? Compact first.</Text>
          <Button key="cold-compact" variant="primary" label={compacting ? 'Compacting…' : 'Compact'} onPress={() => compactCold($)} />
          <Button key="cold-hide" plain dimColor label="Not now" onPress={() => update($, isColdHidden, () => true)} />
          <Box key="frost" flexDirection="row" flexGrow={1} justifyContent="flex-end">
            <Svg source={FROST_SVG} alt="frost" width={DECOR_WIDTH} height={30} isInteractive />
          </Box>
        </Box>
      )
    }
    const v = await snap($)
    const { auto, autoModel, current, judging, wanted, shownByApp } = v
    const inUse = v.modelNow ?? (await sessionModel($))
    const effortNow = effortOf(v, inUse)
    // The model row is paused: effort first. EFFORTLESS_MODEL_UI=1 brings it back.
    const showModel = (await envModelUi($)) === '1'

    const setEffort = (level: Effort) => () => pickEffort($, level)
    // Picking a model yourself turns off Auto for model alone; accepting a suggestion leaves it on.
    const setModel = (model: ModelKey) => async () => {
      await update($, isAutoModel, () => false)
      await $.store.set('isAutoModel', false)
      await changeModel(model)
    }
    // The person sends /model, so the app's own control moves too; with a draft in the box the mod runs it.
    const changeModel = async (model: ModelKey) => {
      if (await typeCommand($, `/model ${model}`)) return
      await switchModel($, model)
    }
    const acceptSuggestion = (model: ModelKey) => () => changeModel(model)
    const toggleAutoModel = async () => {
      const turnOn = !(await read($, isAutoModel))
      await update($, isAutoModel, () => turnOn)
      await $.store.set('isAutoModel', turnOn)
      if (!turnOn) await update($, suggestion, () => null)
    }
    const dismiss = async () => {
      declined = wanted
      await update($, suggestion, () => null)
    }

    const question = wanted ? (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text>Switch to {MODELS.find(m => m.key === wanted)?.label}? The context reloads.</Text>
          <Button key="accept" variant="primary" label="Switch" onPress={acceptSuggestion(wanted)} />
          <Button key="decline" label="Keep" onPress={dismiss} />
        </Box>
      </Box>
    ) : null
    if (e.surface !== 'terminal') return question ?? next(e)

    const notAligned = current && inUse !== 'haiku' && shownByApp && shownByApp !== current.effort
    const note = judging
      ? 'Deciding…'
      : notAligned
        ? `The app's control shows ${EFFORT_LABELS[shownByApp as Effort] ?? shownByApp}`
        : current
          ? `${current.by === 'manual' ? 'You' : current.by === 'jev' ? 'Jev' : current.by === 'custom' ? 'Judge' : 'Haiku'}: ${current.why}`
          : auto
            ? 'Picks the effort at the next prompt'
            : 'Pick an effort'
    const modelRow = (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {MODELS.map(m =>
          m.key === inUse ? (
            <Button key={`m-${m.key}`} variant="primary" label={m.label} onPress={setModel(m.key)} />
          ) : (
            <Button key={`m-${m.key}`} plain dimColor label={m.label} onPress={setModel(m.key)} />
          ),
        )}
        <Box flexGrow={1} />
        <Button
          key="auto-model"
          hotkey="m"
          variant={autoModel ? 'primary' : undefined}
          label={autoModel ? 'Auto on' : 'Auto off'}
          onPress={toggleAutoModel}
        />
      </Box>
    )
    return (
      <Box flexDirection="column">
        {question}
        {showModel ? modelRow : null}
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text dimColor>Effort</Text>
          {EFFORTS.map(level =>
            level === effortNow ? (
              <Button key={`e-${level}`} variant="primary" label={level} onPress={setEffort(level)} />
            ) : (
              <Button key={`e-${level}`} plain dimColor label={level} onPress={setEffort(level)} />
            ),
          )}
          <Box flexGrow={1} />
          <Button
            key="auto"
            hotkey="a"
            variant={auto ? 'primary' : undefined}
            label={auto ? 'Auto on' : 'Auto off'}
            onPress={() => toggleAutoEffort($)}
          />
          <Text dimColor wrap="truncate-end">
            {note}
          </Text>
        </Box>
      </Box>
    )
  })
}
