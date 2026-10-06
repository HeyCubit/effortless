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
const BRAND_BG = '#15121f'
const BRAND_EDGE = '#4a3f80'
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
const ICE_BG = '#0e1820'
const ICE_EDGE = '#2f5c80'
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
const FROST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.f path{stroke:#eaf6ff;stroke-width:.5;stroke-linecap:round;fill:none}.f{transform-box:fill-box;transform-origin:center;animation:spin linear infinite;opacity:.75}@keyframes spin{to{transform:rotate(360deg)}}.fr{stroke:#dff1ff;stroke-width:.4;fill:none;stroke-linecap:round;opacity:.5}.gl{fill:#fff;opacity:0;animation:tw 3.6s ease-in-out infinite}@keyframes tw{0%,70%,100%{opacity:0}80%{opacity:.9}}.br{animation:br 6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.85}50%{opacity:1}}</style><defs><linearGradient id="ice" x1="0" x2="1"><stop offset=".43" stop-color="#5aa9e6" stop-opacity="0"/><stop offset=".62" stop-color="#5aa9e6" stop-opacity=".12"/><stop offset=".85" stop-color="#8fd0ff" stop-opacity=".28"/><stop offset="1" stop-color="#cdeaff" stop-opacity=".42"/></linearGradient><radialGradient id="cold" cx="330" cy="15" r="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9f6ff" stop-opacity=".22"/><stop offset="1" stop-color="#e9f6ff" stop-opacity="0"/></radialGradient><linearGradient id="rime" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".07"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#ice)"/><rect width="360" height="30" fill="url(#cold)"/><rect width="360" height="30" fill="url(#rime)"/><rect width="360" height="30" fill="url(#grain)"/><path class="fr" d="M360.0 3.0L354.1 2.1M354.1 2.1L349.8 1.8M349.8 1.8L346.7 2.1M346.7 2.1L344.4 2.2M348.2 1.9L347.5 3.2M351.9 1.9L350.3 3.1M350.3 3.1L349.2 3.8M357.0 2.5L355.1 0.6M355.1 0.6L353.5 -0.5M353.5 -0.5L352.4 -1.4M356.1 1.6L354.9 1.4M360.0 27.0L354.1 27.9M354.1 27.9L349.8 28.5M349.8 28.5L346.9 29.6M346.9 29.6L345.0 30.8M348.3 29.0L347.1 28.4M351.9 28.2L350.9 29.9M350.9 29.9L350.3 31.1M357.0 27.5L355.2 29.4M355.2 29.4L353.9 30.9M353.9 30.9L352.8 31.8M356.1 28.4L354.9 28.5M350.0 30.0L348.8 26.2M348.8 26.2L347.9 23.4M347.9 23.4L347.6 21.4M347.6 21.4L347.7 19.9M348.4 24.8L348.9 23.6M349.4 28.1L350.2 26.5M350.2 26.5L350.8 25.3M352.0 0.0L351.0 3.9M351.0 3.9L350.4 6.7M350.4 6.7L349.6 8.6M349.6 8.6L349.0 10.0M350.7 5.3L349.6 5.9M351.5 1.9L352.2 3.6M352.2 3.6L352.9 4.7"/><circle class="gl" cx="228" cy="26" r="0.5" style="animation-delay:0s"/><circle class="gl" cx="205" cy="4" r="0.45" style="animation-delay:1.3s"/><circle class="gl" cx="186" cy="26" r="0.4" style="animation-delay:2.4s"/><circle class="gl" cx="262" cy="6" r="0.5" style="animation-delay:0.7s"/><circle class="gl" cx="300" cy="25" r="0.45" style="animation-delay:3.1s"/><circle class="gl" cx="330" cy="6" r="0.5" style="animation-delay:1.9s"/><g class="f" style="animation-duration:10s;animation-delay:0s"><path d="M236.0 9.0L236.0 13.2M236.0 10.9L237.0 11.8M236.0 10.9L235.0 11.8M236.0 11.9L236.7 12.6M236.0 11.9L235.3 12.6M236.0 9.0L232.4 11.1M234.4 9.9L234.0 11.2M234.4 9.9L233.1 9.6M233.5 10.5L233.2 11.4M233.5 10.5L232.6 10.2M236.0 9.0L232.4 6.9M234.4 8.1L233.1 8.4M234.4 8.1L234.0 6.8M233.5 7.5L232.6 7.8M233.5 7.5L233.2 6.6M236.0 9.0L236.0 4.8M236.0 7.1L235.0 6.2M236.0 7.1L237.0 6.2M236.0 6.1L235.3 5.4M236.0 6.1L236.7 5.4M236.0 9.0L239.6 6.9M237.6 8.1L238.0 6.8M237.6 8.1L238.9 8.4M238.5 7.5L238.8 6.6M238.5 7.5L239.4 7.8M236.0 9.0L239.6 11.1M237.6 9.9L238.9 9.6M237.6 9.9L238.0 11.2M238.5 10.5L239.4 10.2M238.5 10.5L238.8 11.4"/></g><g class="f" style="animation-duration:12s;animation-delay:-4s"><path d="M214.0 21.0L214.0 24.2M214.0 22.4L214.7 23.2M214.0 22.4L213.3 23.2M214.0 23.2L214.5 23.7M214.0 23.2L213.5 23.7M214.0 21.0L211.2 22.6M212.8 21.7L212.5 22.7M212.8 21.7L211.8 21.5M212.1 22.1L211.9 22.8M212.1 22.1L211.4 21.9M214.0 21.0L211.2 19.4M212.8 20.3L211.8 20.5M212.8 20.3L212.5 19.3M212.1 19.9L211.4 20.1M212.1 19.9L211.9 19.2M214.0 21.0L214.0 17.8M214.0 19.6L213.3 18.8M214.0 19.6L214.7 18.8M214.0 18.8L213.5 18.3M214.0 18.8L214.5 18.3M214.0 21.0L216.8 19.4M215.2 20.3L215.5 19.3M215.2 20.3L216.2 20.5M215.9 19.9L216.1 19.2M215.9 19.9L216.6 20.1M214.0 21.0L216.8 22.6M215.2 21.7L216.2 21.5M215.2 21.7L215.5 22.7M215.9 22.1L216.6 21.9M215.9 22.1L216.1 22.8"/></g><g class="f" style="animation-duration:11s;animation-delay:-7s"><path d="M194.0 8.0L194.0 10.6M194.0 9.2L194.6 9.8M194.0 9.2L193.4 9.8M194.0 9.8L194.4 10.2M194.0 9.8L193.6 10.2M194.0 8.0L191.7 9.3M193.0 8.6L192.8 9.4M193.0 8.6L192.2 8.4M192.4 8.9L192.3 9.5M192.4 8.9L191.9 8.8M194.0 8.0L191.7 6.7M193.0 7.4L192.2 7.6M193.0 7.4L192.8 6.6M192.4 7.1L191.9 7.2M192.4 7.1L192.3 6.5M194.0 8.0L194.0 5.4M194.0 6.8L193.4 6.2M194.0 6.8L194.6 6.2M194.0 6.2L193.6 5.8M194.0 6.2L194.4 5.8M194.0 8.0L196.3 6.7M195.0 7.4L195.2 6.6M195.0 7.4L195.8 7.6M195.6 7.1L195.7 6.5M195.6 7.1L196.1 7.2M194.0 8.0L196.3 9.3M195.0 8.6L195.8 8.4M195.0 8.6L195.2 9.4M195.6 8.9L196.1 8.8M195.6 8.9L195.7 9.5"/></g><g class="f" style="animation-duration:13s;animation-delay:-2s"><path d="M176.0 19.0L176.0 21.2M176.0 20.0L176.5 20.5M176.0 20.0L175.5 20.5M176.0 20.5L176.3 20.9M176.0 20.5L175.7 20.9M176.0 19.0L174.1 20.1M175.1 19.5L175.0 20.2M175.1 19.5L174.5 19.3M174.7 19.8L174.5 20.2M174.7 19.8L174.2 19.6M176.0 19.0L174.1 17.9M175.1 18.5L174.5 18.7M175.1 18.5L175.0 17.8M174.7 18.2L174.2 18.4M174.7 18.2L174.5 17.8M176.0 19.0L176.0 16.8M176.0 18.0L175.5 17.5M176.0 18.0L176.5 17.5M176.0 17.5L175.7 17.1M176.0 17.5L176.3 17.1M176.0 19.0L177.9 17.9M176.9 18.5L177.0 17.8M176.9 18.5L177.5 18.7M177.3 18.2L177.5 17.8M177.3 18.2L177.8 18.4M176.0 19.0L177.9 20.1M176.9 19.5L177.5 19.3M176.9 19.5L177.0 20.2M177.3 19.8L177.8 19.6M177.3 19.8L177.5 20.2"/></g><g class="f" style="animation-duration:14s;animation-delay:-9s"><path d="M252.0 22.0L252.0 24.4M252.0 23.1L252.5 23.6M252.0 23.1L251.5 23.6M252.0 23.7L252.4 24.1M252.0 23.7L251.6 24.1M252.0 22.0L249.9 23.2M251.1 22.5L250.9 23.3M251.1 22.5L250.3 22.3M250.5 22.8L250.4 23.4M250.5 22.8L250.0 22.7M252.0 22.0L249.9 20.8M251.1 21.5L250.3 21.7M251.1 21.5L250.9 20.7M250.5 21.2L250.0 21.3M250.5 21.2L250.4 20.6M252.0 22.0L252.0 19.6M252.0 20.9L251.5 20.4M252.0 20.9L252.5 20.4M252.0 20.3L251.6 19.9M252.0 20.3L252.4 19.9M252.0 22.0L254.1 20.8M252.9 21.5L253.1 20.7M252.9 21.5L253.7 21.7M253.5 21.2L253.6 20.6M253.5 21.2L254.0 21.3M252.0 22.0L254.1 23.2M252.9 22.5L253.7 22.3M252.9 22.5L253.1 23.3M253.5 22.8L254.0 22.7M253.5 22.8L253.6 23.4"/></g></g></svg>`
// The frost is drawn larger than the band and cut by it: wide enough for the right side, tall enough for any band.
const FROST_WIDTH = 440
const FROST_HEIGHT = 64
const SETTINGS_COMMAND = '/plugin configure effortless@effortless'
// The right of the setup guide, pure decoration (the name is on the left): a purple gradient with a soft glow,
// faint light streaks and grain, a still star, and small sparkles that twinkle in and out here and there. One constant source, so the app never rebuilds its frame (a changing source flickers); the
// motion is CSS inside it.
const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.sp{fill:#fff;opacity:0;transform:scale(0);animation-name:gl;animation-timing-function:ease-in-out;animation-iteration-count:infinite}@keyframes gl{0%,72%,100%{opacity:0;transform:scale(0) rotate(0deg)}82%{opacity:.9;transform:scale(1) rotate(30deg)}92%{opacity:0;transform:scale(.2) rotate(60deg)}}.br{animation:br 6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.85}50%{opacity:1}}</style><defs><linearGradient id="bg" x1="0" x2="1"><stop offset=".43" stop-color="#7c6cf0" stop-opacity="0"/><stop offset=".62" stop-color="#7c6cf0" stop-opacity=".16"/><stop offset=".85" stop-color="#8f7ff0" stop-opacity=".34"/><stop offset="1" stop-color="#b3a6ff" stop-opacity=".48"/></linearGradient><radialGradient id="glow" cx="320" cy="15" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c9bdff" stop-opacity=".28"/><stop offset="1" stop-color="#9a86ff" stop-opacity="0"/></radialGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".07"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#bg)"/><rect width="360" height="30" fill="url(#glow)"/><rect width="360" height="30" fill="url(#grain)"/><line x1="186" y1="32" x2="198" y2="-2" stroke="#fff" stroke-opacity="0.04" stroke-width="3"/><line x1="204" y1="32" x2="216" y2="-2" stroke="#fff" stroke-opacity="0.05" stroke-width="1.2"/><line x1="226" y1="32" x2="238" y2="-2" stroke="#fff" stroke-opacity="0.05" stroke-width="4"/><line x1="262" y1="32" x2="274" y2="-2" stroke="#fff" stroke-opacity="0.04" stroke-width="1.5"/><line x1="290" y1="32" x2="302" y2="-2" stroke="#fff" stroke-opacity="0.05" stroke-width="3"/><line x1="320" y1="32" x2="332" y2="-2" stroke="#fff" stroke-opacity="0.04" stroke-width="1.2"/><path class="sp" style="transform-origin:168px 8px;animation-duration:4.2s;animation-delay:0.3s" d="M168 6.4 L168.34 7.66 L169.6 8 L168.34 8.34 L168 9.6 L167.66 8.34 L166.4 8 L167.66 7.66 Z"/><path class="sp" style="transform-origin:182px 22px;animation-duration:5.1s;animation-delay:2.1s" d="M182 20.7 L182.27 21.73 L183.3 22 L182.27 22.27 L182 23.3 L181.73 22.27 L180.7 22 L181.73 21.73 Z"/><path class="sp" style="transform-origin:196px 6px;animation-duration:3.8s;animation-delay:1.2s" d="M196 4.2 L196.38 5.62 L197.8 6 L196.38 6.38 L196 7.8 L195.62 6.38 L194.2 6 L195.62 5.62 Z"/><path class="sp" style="transform-origin:208px 19px;animation-duration:4.6s;animation-delay:3.4s" d="M208 17.8 L208.25 18.75 L209.2 19 L208.25 19.25 L208 20.2 L207.75 19.25 L206.8 19 L207.75 18.75 Z"/><path class="sp" style="transform-origin:221px 9px;animation-duration:5.4s;animation-delay:0.9s" d="M221 7.5 L221.31 8.69 L222.5 9 L221.31 9.31 L221 10.5 L220.69 9.31 L219.5 9 L220.69 8.69 Z"/><path class="sp" style="transform-origin:232px 23px;animation-duration:4.0s;animation-delay:2.7s" d="M232 21.9 L232.23 22.77 L233.1 23 L232.23 23.23 L232 24.1 L231.77 23.23 L230.9 23 L231.77 22.77 Z"/><path class="sp" style="transform-origin:244px 7px;animation-duration:4.8s;animation-delay:1.8s" d="M244 5.7 L244.27 6.73 L245.3 7 L244.27 7.27 L244 8.3 L243.73 7.27 L242.7 7 L243.73 6.73 Z"/><path class="sp" style="transform-origin:176px 15px;animation-duration:5.8s;animation-delay:4.0s" d="M176 14.0 L176.21 14.79 L177.0 15 L176.21 15.21 L176 16.0 L175.79 15.21 L175.0 15 L175.79 14.79 Z"/><path class="sp" style="transform-origin:214px 26px;animation-duration:4.4s;animation-delay:3.0s" d="M214 25.0 L214.21 25.79 L215.0 26 L214.21 26.21 L214 27.0 L213.79 26.21 L213.0 26 L213.79 25.79 Z"/><path class="sp" style="transform-origin:238px 15px;animation-duration:3.6s;animation-delay:0.1s" d="M238 14.0 L238.21 14.79 L239.0 15 L238.21 15.21 L238 16.0 L237.79 15.21 L237.0 15 L237.79 14.79 Z"/></g></svg>`

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
  } catch (error) {
    // Say what actually stopped it: a running turn is the usual reason, but not the only one.
    const why = error instanceof Error ? error.message : String(error)
    void proof($, `compact failed: ${why}`)
    $.ui.toast(
      /turn|running|busy/i.test(why)
        ? "effortless: can't compact while Claude is working"
        : `effortless: compact failed: ${why.slice(0, 140)}`,
    )
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
        {/* Cold: the band above the prompt says it and holds Compact; the footer only shows the state, in ice blue. */}
        {v.cacheNow === 0 ? (
          <Text color={ICE}>{cacheLabel(0)}</Text>
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
      // The same build as the cold band: one styled surface, the art a backdrop layer behind the right side, and the
      // buttons in a later layer so they are drawn on top of it. The text keeps clear of them with a spacer.
      const band = (words: string, buttons: unknown) => (
        <Box
          key="setup"
          position="relative"
          flexDirection="row"
          gap={1}
          alignItems="center"
          paddingX={1}
          overflow="hidden"
          backgroundColor={BRAND_BG}
          borderStyle="round"
          borderColor={BRAND_EDGE}
        >
          <Box key="brand" position="absolute" top={-1} right={0} bottom={-1}>
            <Svg source={BRAND_SVG} alt="effortless" width={FROST_WIDTH} height={FROST_HEIGHT} isInteractive />
          </Box>
          <Box flexShrink={0}>
            <Text color={ACCENT} bold wrap="truncate">
              ✦ effortless
            </Text>
          </Box>
          <Text wrap="truncate">{words}</Text>
          <Box flexGrow={1} minWidth={34} />
          <Box key="setup-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={1} alignItems="center">
            {buttons}
          </Box>
        </Box>
      )
      if (step === 'pick')
        return band(
          'Who picks the effort?',
          <>
            <Button key="setup-jev" variant="primary" label="Jev (API)" onPress={() => pickJudge($, 'jev')} />
            <Button key="setup-haiku" label="Haiku (no key)" onPress={() => pickJudge($, 'haiku')} />
            <Button key="setup-later" label="⏎" onPress={() => finishSetup($)} />
          </>,
        )
      return band(
        step === 'jev' ? 'Paste a TypeSafe key (typesafe.ai) in settings, then restart.' : 'Fill in URL, model and key in settings, then restart.',
        <>
          <Button key="setup-open" variant="primary" label="Open settings" onPress={openSettings} />
          <Button
            key="setup-done"
            label="Done"
            onPress={() => finishSetup($, 'effortless: restart Claude Code so the new settings are used.')}
          />
          <Button key="setup-back" plain label="Back" onPress={() => update($, setupStep, () => 'pick')} />
        </>,
      )
    }
    // The cache went cold: the next message writes the whole chat again at full price. Said where it cannot be missed.
    if ((await read($, cacheLeft)) === 0 && !(await read($, isColdHidden))) {
      const compacting = await read($, isCompacting)
      // The art is a backdrop: an absolutely placed layer behind the right side, so the words and Compact sit on it.
      return (
        <Box
          key="cold"
          position="relative"
          flexDirection="row"
          gap={1}
          alignItems="center"
          paddingX={1}
          overflow="hidden"
          backgroundColor={ICE_BG}
          borderStyle="round"
          borderColor={ICE_EDGE}
        >
          {/* Taller than the band and clipped by it, so the frost reaches every edge on the right. */}
          <Box key="frost" position="absolute" top={-1} right={0} bottom={-1}>
            <Svg source={FROST_SVG} alt="frost" width={FROST_WIDTH} height={FROST_HEIGHT} isInteractive />
          </Box>
          <Box flexShrink={0}>
            <Text color={ICE} bold wrap="truncate">
              ❄ Chat went cold
            </Text>
          </Box>
          <Text wrap="truncate">Next message costs full price. Compact first.</Text>
          {/* Room for the buttons, which sit in their own layer after the frost so they are drawn on top of it. */}
          <Box flexGrow={1} minWidth={22} />
          <Box key="cold-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={1} alignItems="center">
            <Button key="cold-hide" plain label="Not now" onPress={() => update($, isColdHidden, () => true)} />
            <Button key="cold-compact" variant="primary" label={compacting ? 'Compacting…' : 'Compact'} onPress={() => compactCold($)} />
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
