import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort, ModelKey, Pick, SettingsDraft, Spent } from '../types'

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
// The settings panel's header bar: a shade lighter than the panel, so it reads as a title bar.
const BRAND_HEAD = '#221c3a'
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
const BOG = '#a7c98f'
const BOG_BG = '#111710'
const BOG_EDGE = '#3e5a33'
const EMBER = '#f08a3c'
const EMBER_BG = '#1a110c'
const EMBER_EDGE = '#6a3418'
const SLATE = '#b4b8c4'
const SLATE_BG = '#12141b'
const SLATE_EDGE = '#39415a'
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
// Where a handoff is: null idle, writing (the handoff turn runs), clearing (clear and resend).
const handoffStage = atom({ plugin: 'effortless', key: 'handoffStage' } as const, null)
// The context is swamped: tokens read per request, or null below the line. Drives the swamp band.
const swamped = atom({ plugin: 'effortless', key: 'swamped' } as const, null)
// The swamp band was closed at this many tokens; it comes back once the context has grown well past it.
const swampHiddenAt = atom({ plugin: 'effortless', key: 'swampHiddenAt' } as const, null)
// The first-run setup is not done: the footer offers "Setup".
const setupPending = atom({ plugin: 'effortless', key: 'setupPending' } as const, false)
// Why the judge the person picked is failing (Haiku stands in), or null when it works.
// The effortless settings panel is open above the prompt.
const settingsOpen = atom({ plugin: 'effortless', key: 'settingsOpen' } as const, false)
// What was changed in the panel and not saved yet, by field; Save applies it all, the cross drops it.
const settingsDraft = atom({ plugin: 'effortless', key: 'settingsDraft' } as const, {})
const judgeDown = atom({ plugin: 'effortless', key: 'judgeDown' } as const, null)
// The judge-down band was closed for this reason; a new reason shows it again.
const judgeDownHidden = atom({ plugin: 'effortless', key: 'judgeDownHidden' } as const, null)
// A usage limit is close: which window, how much is used, when it resets. Null below the line.
const hot = atom({ plugin: 'effortless', key: 'hot' } as const, null)
// The running-hot band was closed at this many percent; it returns ten points later or in a new window.
const hotHidden = atom({ plugin: 'effortless', key: 'hotHidden' } as const, null)
// Save mode: Auto picks at most medium until this time (ms), when the limit resets.
const saveUntil = atom({ plugin: 'effortless', key: 'saveUntil' } as const, null)
const isColdHidden = atom({ plugin: 'effortless', key: 'isColdHidden' } as const, false)
// The setup guide above the prompt: which step it shows, or null when it is closed.
const setupStep = atom({ plugin: 'effortless', key: 'setupStep' } as const, null)
// The band above the prompt when the cache has gone cold: an icy gradient with snowflakes drifting down.
const FROST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.f path{stroke:#eaf6ff;stroke-width:.5;stroke-linecap:round;fill:none}.f{transform-box:fill-box;transform-origin:center;animation:spin linear infinite;opacity:.75}@keyframes spin{to{transform:rotate(360deg)}}.fr{stroke:#dff1ff;stroke-width:.4;fill:none;stroke-linecap:round;opacity:.5}.gl{fill:#fff;opacity:0;animation:tw 3.6s ease-in-out infinite}@keyframes tw{0%,70%,100%{opacity:0}80%{opacity:.9}}.br{animation:br 6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.85}50%{opacity:1}}</style><defs><linearGradient id="ice" x1="0" x2="1"><stop offset=".43" stop-color="#5aa9e6" stop-opacity="0"/><stop offset=".62" stop-color="#5aa9e6" stop-opacity=".12"/><stop offset=".85" stop-color="#8fd0ff" stop-opacity=".28"/><stop offset="1" stop-color="#cdeaff" stop-opacity=".42"/></linearGradient><radialGradient id="cold" cx="330" cy="15" r="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9f6ff" stop-opacity=".22"/><stop offset="1" stop-color="#e9f6ff" stop-opacity="0"/></radialGradient><linearGradient id="rime" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".07"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#ice)"/><rect width="360" height="30" fill="url(#cold)"/><rect width="360" height="30" fill="url(#rime)"/><rect width="360" height="30" fill="url(#grain)"/><path class="fr" d="M360.0 3.0L354.1 2.1M354.1 2.1L349.8 1.8M349.8 1.8L346.7 2.1M346.7 2.1L344.4 2.2M348.2 1.9L347.5 3.2M351.9 1.9L350.3 3.1M350.3 3.1L349.2 3.8M357.0 2.5L355.1 0.6M355.1 0.6L353.5 -0.5M353.5 -0.5L352.4 -1.4M356.1 1.6L354.9 1.4M360.0 27.0L354.1 27.9M354.1 27.9L349.8 28.5M349.8 28.5L346.9 29.6M346.9 29.6L345.0 30.8M348.3 29.0L347.1 28.4M351.9 28.2L350.9 29.9M350.9 29.9L350.3 31.1M357.0 27.5L355.2 29.4M355.2 29.4L353.9 30.9M353.9 30.9L352.8 31.8M356.1 28.4L354.9 28.5M350.0 30.0L348.8 26.2M348.8 26.2L347.9 23.4M347.9 23.4L347.6 21.4M347.6 21.4L347.7 19.9M348.4 24.8L348.9 23.6M349.4 28.1L350.2 26.5M350.2 26.5L350.8 25.3M352.0 0.0L351.0 3.9M351.0 3.9L350.4 6.7M350.4 6.7L349.6 8.6M349.6 8.6L349.0 10.0M350.7 5.3L349.6 5.9M351.5 1.9L352.2 3.6M352.2 3.6L352.9 4.7"/><circle class="gl" cx="228" cy="26" r="0.5" style="animation-delay:0s"/><circle class="gl" cx="205" cy="4" r="0.45" style="animation-delay:1.3s"/><circle class="gl" cx="186" cy="26" r="0.4" style="animation-delay:2.4s"/><circle class="gl" cx="262" cy="6" r="0.5" style="animation-delay:0.7s"/><circle class="gl" cx="300" cy="25" r="0.45" style="animation-delay:3.1s"/><circle class="gl" cx="330" cy="6" r="0.5" style="animation-delay:1.9s"/><g class="f" style="animation-duration:10s;animation-delay:0s"><path d="M236.0 9.0L236.0 13.2M236.0 10.9L237.0 11.8M236.0 10.9L235.0 11.8M236.0 11.9L236.7 12.6M236.0 11.9L235.3 12.6M236.0 9.0L232.4 11.1M234.4 9.9L234.0 11.2M234.4 9.9L233.1 9.6M233.5 10.5L233.2 11.4M233.5 10.5L232.6 10.2M236.0 9.0L232.4 6.9M234.4 8.1L233.1 8.4M234.4 8.1L234.0 6.8M233.5 7.5L232.6 7.8M233.5 7.5L233.2 6.6M236.0 9.0L236.0 4.8M236.0 7.1L235.0 6.2M236.0 7.1L237.0 6.2M236.0 6.1L235.3 5.4M236.0 6.1L236.7 5.4M236.0 9.0L239.6 6.9M237.6 8.1L238.0 6.8M237.6 8.1L238.9 8.4M238.5 7.5L238.8 6.6M238.5 7.5L239.4 7.8M236.0 9.0L239.6 11.1M237.6 9.9L238.9 9.6M237.6 9.9L238.0 11.2M238.5 10.5L239.4 10.2M238.5 10.5L238.8 11.4"/></g><g class="f" style="animation-duration:12s;animation-delay:-4s"><path d="M214.0 21.0L214.0 24.2M214.0 22.4L214.7 23.2M214.0 22.4L213.3 23.2M214.0 23.2L214.5 23.7M214.0 23.2L213.5 23.7M214.0 21.0L211.2 22.6M212.8 21.7L212.5 22.7M212.8 21.7L211.8 21.5M212.1 22.1L211.9 22.8M212.1 22.1L211.4 21.9M214.0 21.0L211.2 19.4M212.8 20.3L211.8 20.5M212.8 20.3L212.5 19.3M212.1 19.9L211.4 20.1M212.1 19.9L211.9 19.2M214.0 21.0L214.0 17.8M214.0 19.6L213.3 18.8M214.0 19.6L214.7 18.8M214.0 18.8L213.5 18.3M214.0 18.8L214.5 18.3M214.0 21.0L216.8 19.4M215.2 20.3L215.5 19.3M215.2 20.3L216.2 20.5M215.9 19.9L216.1 19.2M215.9 19.9L216.6 20.1M214.0 21.0L216.8 22.6M215.2 21.7L216.2 21.5M215.2 21.7L215.5 22.7M215.9 22.1L216.6 21.9M215.9 22.1L216.1 22.8"/></g><g class="f" style="animation-duration:11s;animation-delay:-7s"><path d="M194.0 8.0L194.0 10.6M194.0 9.2L194.6 9.8M194.0 9.2L193.4 9.8M194.0 9.8L194.4 10.2M194.0 9.8L193.6 10.2M194.0 8.0L191.7 9.3M193.0 8.6L192.8 9.4M193.0 8.6L192.2 8.4M192.4 8.9L192.3 9.5M192.4 8.9L191.9 8.8M194.0 8.0L191.7 6.7M193.0 7.4L192.2 7.6M193.0 7.4L192.8 6.6M192.4 7.1L191.9 7.2M192.4 7.1L192.3 6.5M194.0 8.0L194.0 5.4M194.0 6.8L193.4 6.2M194.0 6.8L194.6 6.2M194.0 6.2L193.6 5.8M194.0 6.2L194.4 5.8M194.0 8.0L196.3 6.7M195.0 7.4L195.2 6.6M195.0 7.4L195.8 7.6M195.6 7.1L195.7 6.5M195.6 7.1L196.1 7.2M194.0 8.0L196.3 9.3M195.0 8.6L195.8 8.4M195.0 8.6L195.2 9.4M195.6 8.9L196.1 8.8M195.6 8.9L195.7 9.5"/></g><g class="f" style="animation-duration:13s;animation-delay:-2s"><path d="M176.0 19.0L176.0 21.2M176.0 20.0L176.5 20.5M176.0 20.0L175.5 20.5M176.0 20.5L176.3 20.9M176.0 20.5L175.7 20.9M176.0 19.0L174.1 20.1M175.1 19.5L175.0 20.2M175.1 19.5L174.5 19.3M174.7 19.8L174.5 20.2M174.7 19.8L174.2 19.6M176.0 19.0L174.1 17.9M175.1 18.5L174.5 18.7M175.1 18.5L175.0 17.8M174.7 18.2L174.2 18.4M174.7 18.2L174.5 17.8M176.0 19.0L176.0 16.8M176.0 18.0L175.5 17.5M176.0 18.0L176.5 17.5M176.0 17.5L175.7 17.1M176.0 17.5L176.3 17.1M176.0 19.0L177.9 17.9M176.9 18.5L177.0 17.8M176.9 18.5L177.5 18.7M177.3 18.2L177.5 17.8M177.3 18.2L177.8 18.4M176.0 19.0L177.9 20.1M176.9 19.5L177.5 19.3M176.9 19.5L177.0 20.2M177.3 19.8L177.8 19.6M177.3 19.8L177.5 20.2"/></g><g class="f" style="animation-duration:14s;animation-delay:-9s"><path d="M252.0 22.0L252.0 24.4M252.0 23.1L252.5 23.6M252.0 23.1L251.5 23.6M252.0 23.7L252.4 24.1M252.0 23.7L251.6 24.1M252.0 22.0L249.9 23.2M251.1 22.5L250.9 23.3M251.1 22.5L250.3 22.3M250.5 22.8L250.4 23.4M250.5 22.8L250.0 22.7M252.0 22.0L249.9 20.8M251.1 21.5L250.3 21.7M251.1 21.5L250.9 20.7M250.5 21.2L250.0 21.3M250.5 21.2L250.4 20.6M252.0 22.0L252.0 19.6M252.0 20.9L251.5 20.4M252.0 20.9L252.5 20.4M252.0 20.3L251.6 19.9M252.0 20.3L252.4 19.9M252.0 22.0L254.1 20.8M252.9 21.5L253.1 20.7M252.9 21.5L253.7 21.7M253.5 21.2L253.6 20.6M253.5 21.2L254.0 21.3M252.0 22.0L254.1 23.2M252.9 22.5L253.7 22.3M252.9 22.5L253.1 23.3M253.5 22.8L254.0 22.7M253.5 22.8L253.6 23.4"/></g></g></svg>`
// The frost is drawn larger than the band and cut by it: wide enough for the right side, tall enough for any band.
const FROST_WIDTH = 440
const FROST_HEIGHT = 64
// TypeSafe's mark (from typesafe.ai), drawn beside the Jev button: a Button holds text only.
const TYPESAFE_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="18" viewBox="0 0 16.487 24"><style>svg{background:transparent;display:block}</style><path d="M 12.756 2.928 L 12.756 7.067 L 16.486 9.487 L 16.487 18.652 L 8.244 24 L 3.732 21.073 L 3.732 16.82 L 0 14.399 L 0 5.35 L 0.355 5.118 L 8.244 0 Z M 5.94 20.65 L 8.242 22.144 L 14.275 18.227 L 11.975 16.735 Z M 9.022 10.332 L 9.022 14.4 L 5.29 16.822 L 5.29 19.216 L 11.197 15.383 L 11.197 8.921 Z M 12.756 15.384 L 14.928 16.794 L 14.928 10.332 L 12.756 8.922 Z M 2.21 13.976 L 4.511 15.47 L 6.812 13.976 L 4.512 12.485 Z M 1.559 6.193 L 1.559 12.544 L 3.731 11.134 L 3.731 7.066 L 7.464 4.643 L 7.464 2.36 L 1.56 6.193 Z M 5.291 11.132 L 7.463 12.542 L 7.463 10.332 L 5.292 8.921 L 5.292 11.132 Z M 5.94 7.487 L 8.244 8.981 L 10.544 7.488 L 8.244 5.994 Z M 9.024 4.643 L 11.196 6.054 L 11.196 3.774 L 9.024 2.359 Z" fill="#ffffff"/></svg>`
// Claude's mark (from claude.ai) in white, drawn beside the Haiku button.
const CLAUDE_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 248 248"><style>svg{background:transparent;display:block}</style><path d="M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z" fill="#ffffff"/></svg>`
// The band when the context is swamped: murky green, bubbles rising, slow ripples.
const SWAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.b{fill:none;stroke:#cfe8b8;stroke-width:.5;opacity:0;animation-name:rise;animation-timing-function:ease-in;animation-iteration-count:infinite}@keyframes rise{0%{opacity:0;transform:translate(0,0)}15%{opacity:.7}80%{opacity:.5}100%{opacity:0;transform:translate(3px,-30px)}}.rp{fill:none;stroke:#a7c98f;stroke-width:.4;stroke-linecap:round;opacity:.25;animation:drift 7s ease-in-out infinite}@keyframes drift{0%,100%{transform:translate(0,0);opacity:.15}50%{transform:translate(4px,0);opacity:.4}}.mk{animation:mk 8s ease-in-out infinite}@keyframes mk{0%,100%{opacity:.85}50%{opacity:1}}</style><defs><linearGradient id="bog" x1="0" x2="1"><stop offset=".43" stop-color="#4f7a3a" stop-opacity="0"/><stop offset=".62" stop-color="#4f7a3a" stop-opacity=".16"/><stop offset=".85" stop-color="#6f9a4f" stop-opacity=".32"/><stop offset="1" stop-color="#9cc27a" stop-opacity=".42"/></linearGradient><linearGradient id="silt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#2b3a1f" stop-opacity=".18"/><stop offset="1" stop-color="#1c2614" stop-opacity=".45"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".06"/></pattern></defs><g mask="url(#m)"><rect class="mk" width="360" height="30" fill="url(#bog)"/><rect width="360" height="30" fill="url(#silt)"/><rect width="360" height="30" fill="url(#grain)"/><path class="rp" style="animation-delay:-0s" d="M190 22 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-2.5s" d="M226 9 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-5s" d="M250 18 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-1.5s" d="M300 24 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-3.8s" d="M322 7 q6 -2 12 0 t12 0"/><circle class="b" cx="168" cy="32" r="1.6" style="animation-duration:6.5s;animation-delay:-0s"/><circle class="b" cx="182" cy="32" r="1.1" style="animation-duration:8s;animation-delay:-2.1s"/><circle class="b" cx="197" cy="32" r="2.0" style="animation-duration:7s;animation-delay:-4.2s"/><circle class="b" cx="210" cy="32" r="1.3" style="animation-duration:9s;animation-delay:-1.0s"/><circle class="b" cx="224" cy="32" r="1.7" style="animation-duration:7.5s;animation-delay:-3.3s"/><circle class="b" cx="238" cy="32" r="1.0" style="animation-duration:8.5s;animation-delay:-5.1s"/><circle class="b" cx="252" cy="32" r="1.4" style="animation-duration:6.8s;animation-delay:-2.6s"/><circle class="b" cx="176" cy="32" r="0.9" style="animation-duration:9.5s;animation-delay:-6.0s"/><circle class="b" cx="232" cy="32" r="0.8" style="animation-duration:10s;animation-delay:-0.5s"/></g></svg>`
// The band when a usage limit is close: embers, sparks rising.
const EMBER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.s{fill:#ffb06a;opacity:0;animation-name:up;animation-timing-function:ease-out;animation-iteration-count:infinite}@keyframes up{0%{opacity:0;transform:translate(0,0)}12%{opacity:.95}70%{opacity:.6}100%{opacity:0;transform:translate(4px,-30px)}}.br{animation:br 3.4s ease-in-out infinite}@keyframes br{0%,100%{opacity:.8}50%{opacity:1}}.br2{animation:br2 2.2s ease-in-out infinite}@keyframes br2{0%,100%{opacity:.7}40%{opacity:1}70%{opacity:.8}}</style><defs><linearGradient id="heat" x1="0" x2="1"><stop offset=".43" stop-color="#b8461b" stop-opacity="0"/><stop offset=".62" stop-color="#b8461b" stop-opacity=".16"/><stop offset=".85" stop-color="#d9622a" stop-opacity=".32"/><stop offset="1" stop-color="#f08a3c" stop-opacity=".42"/></linearGradient><linearGradient id="glow" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#e2581f" stop-opacity=".08"/><stop offset="1" stop-color="#ff7a2e" stop-opacity=".32"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".06"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#heat)"/><rect class="br2" width="360" height="30" fill="url(#glow)"/><circle class="s" cx="166" cy="31" r="0.7" style="animation-duration:3.2s;animation-delay:-0s"/><circle class="s" cx="178" cy="31" r="0.5" style="animation-duration:4.1s;animation-delay:-1.2s"/><circle class="s" cx="191" cy="31" r="0.8" style="animation-duration:3.6s;animation-delay:-2.4s"/><circle class="s" cx="203" cy="31" r="0.5" style="animation-duration:4.6s;animation-delay:-0.7s"/><circle class="s" cx="216" cy="31" r="0.7" style="animation-duration:3.9s;animation-delay:-3.0s"/><circle class="s" cx="228" cy="31" r="0.6" style="animation-duration:4.3s;animation-delay:-1.8s"/><circle class="s" cx="241" cy="31" r="0.8" style="animation-duration:3.4s;animation-delay:-0.4s"/><circle class="s" cx="254" cy="31" r="0.5" style="animation-duration:4.8s;animation-delay:-2.9s"/><circle class="s" cx="184" cy="31" r="0.4" style="animation-duration:5.0s;animation-delay:-3.6s"/><circle class="s" cx="236" cy="31" r="0.4" style="animation-duration:4.4s;animation-delay:-2.1s"/><rect width="360" height="30" fill="url(#grain)"/></g></svg>`
// The band when the judge the person picked is failing: signal lost, a blip sweeping along a flat line.
const DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.tr{fill:none;stroke:#e6ecf8;stroke-width:.6;stroke-linecap:round;stroke-linejoin:round}.gw{fill:none;stroke:#9fb0d6;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.35}.hd{animation:hd 4.8s linear infinite}@keyframes hd{0%{transform:translate(150px,0)}88%,100%{transform:translate(372px,0)}}.gl{animation:gl 4.8s ease-in-out infinite}@keyframes gl{0%,100%{opacity:.75}50%{opacity:1}}</style><defs><linearGradient id="steel" x1="0" x2="1"><stop offset=".43" stop-color="#5d6a86" stop-opacity="0"/><stop offset=".65" stop-color="#5d6a86" stop-opacity=".16"/><stop offset=".88" stop-color="#7d8aa8" stop-opacity=".32"/><stop offset="1" stop-color="#a3afca" stop-opacity=".42"/></linearGradient><radialGradient id="glow" cx="330" cy="15" r="80" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c4cee6" stop-opacity=".22"/><stop offset="1" stop-color="#8d9ab8" stop-opacity="0"/></radialGradient><pattern id="grid" width="7.5" height="7.5" patternUnits="userSpaceOnUse"><path d="M7.5 0 L0 0 L0 7.5" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width=".25"/></pattern><linearGradient id="trail" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><mask id="sweep"><g class="hd"><rect x="-110" y="0" width="110" height="30" fill="url(#trail)"/></g></mask></defs><g mask="url(#m)"><rect class="gl" width="360" height="30" fill="url(#steel)"/><rect width="360" height="30" fill="url(#glow)"/><rect width="360" height="30" fill="url(#grid)"/><g mask="url(#sweep)"><path class="gw" d="M150 15 L196 15 L196.0 15.0 L199.0 13.8 L202.0 15.0 L204.0 15.0 L205.5 16.5 L208.0 5.0 L210.5 19.0 L212.0 15.0 L216.0 15.0 L220.0 13.0 L224.0 15.0 L238 15 L238.0 15.0 L241.0 14.2 L244.0 15.0 L246.0 15.0 L247.5 16.1 L250.0 8.0 L252.5 17.8 L254.0 15.0 L258.0 15.0 L262.0 13.6 L266.0 15.0 L278 15 L278.0 15.0 L281.0 14.5 L284.0 15.0 L286.0 15.0 L287.5 15.6 L290.0 11.2 L292.5 16.5 L294.0 15.0 L298.0 15.0 L302.0 14.2 L306.0 15.0 L316 15 L316.0 15.0 L319.0 14.9 L322.0 15.0 L324.0 15.0 L325.5 15.2 L328.0 13.8 L330.5 15.5 L332.0 15.0 L336.0 15.0 L340.0 14.8 L344.0 15.0 L360 15"/><path class="tr" d="M150 15 L196 15 L196.0 15.0 L199.0 13.8 L202.0 15.0 L204.0 15.0 L205.5 16.5 L208.0 5.0 L210.5 19.0 L212.0 15.0 L216.0 15.0 L220.0 13.0 L224.0 15.0 L238 15 L238.0 15.0 L241.0 14.2 L244.0 15.0 L246.0 15.0 L247.5 16.1 L250.0 8.0 L252.5 17.8 L254.0 15.0 L258.0 15.0 L262.0 13.6 L266.0 15.0 L278 15 L278.0 15.0 L281.0 14.5 L284.0 15.0 L286.0 15.0 L287.5 15.6 L290.0 11.2 L292.5 16.5 L294.0 15.0 L298.0 15.0 L302.0 14.2 L306.0 15.0 L316 15 L316.0 15.0 L319.0 14.9 L322.0 15.0 L324.0 15.0 L325.5 15.2 L328.0 13.8 L330.5 15.5 L332.0 15.0 L336.0 15.0 L340.0 14.8 L344.0 15.0 L360 15"/></g></g></svg>`
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

If the message answers a question in the assistant's last reply (picks an option, says which one, confirms a plan), judge only the work that answer starts, as the reply describes it, not the length of the answer and not the work done before the question: "B" can mean "build the complicated section B" (high), while "yes" or "no" to one small action ("should I archive this?", "delete the old ones too?") is low, and picking a value for one setting (a log level, a colour, a font) is low. But picking which way to build something ("option 1", "the same shapes", "B") starts that build: judge the build. Approving a whole plan or several steps takes the effort of that plan. A plain "yes", "ok" or "do it" after "Is that OK? Then I'll build X" or "Should I build X?" approves building X: judge X, not the word.

A message that pushes back on, corrects or adds to a plan or claim under discussion continues that work: keep at least the effort that work had, never drop to low for it. Thanks, praise or a closing remark with no new request is low. A question about how to do something, or about effort itself, that needs no tools is low.

If the person asks for deep thought ("think hard", "ultrathink", "be thorough"), pick at least high; if they ask for a quick answer, pick low.

If the message is a short follow-up to ongoing work ("yes", "go", "ok", "continue", or the same in any language), keep the current pair.

Reply with JSON only: {"model":"haiku|sonnet|opus|fable","effort":"low|medium|high|xhigh|max","sure":0.0-1.0 how sure you are of the effort,"why":"at most 6 words, in the user's language"}`

/** Reads `{ model, effort, why }` out of a reply, or nothing when it doesn't hold one. */
export function parseVerdict(text: string): { model: ModelKey; effort: Effort; why: string; sure?: number } | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(match[0])
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const { model, effort, why, sure } = raw as Record<string, unknown>
  const key = typeof model === 'string' ? model.toLowerCase() : ''
  const found = MODELS.find(m => key === m.key || key === m.id || key.includes(m.key))
  if (!found || !EFFORTS.includes(effort as Effort)) return undefined
  const how = typeof sure === 'number' && sure >= 0 && sure <= 1 ? { sure } : {}
  return { model: found.key, effort: effort as Effort, why: typeof why === 'string' ? why.slice(0, 60) : '', ...how }
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
  'approving a whole plan takes the effort of that plan; a plain yes to "Then I will build X" means judge X. Pushing back on or adding to a plan under discussion continues that work: keep its effort, never low. Thanks or a closing remark with no new request is low. A ' +
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
export function parseJevAnswer(text: string, current: Pick | null): { model: ModelKey; effort: Effort; why: string; sure?: number } | undefined {
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
  if (current && typeof sure === 'number' && sure < 0.5) return { model, effort: current.effort, why: UNSURE, sure }
  if (typeof sure !== 'number') return { model, effort, why: '' }
  return { model, effort, why: `${Math.round(sure * 100)}% sure`, sure }
}

let askJevFile: EnvAsk | undefined
// A key was saved from the settings panel into ~/.config/jev/.env: that file wins over an older key in the settings.
let keyFromFile = false
/**
 * The TypeSafe key: from the settings, else TYPESAFE_API_KEY. Only when the person picked the jev judge outright is
 * ~/.config/jev/.env read as well: a mod should not open a file holding a secret it was not asked to use.
 */
async function jevKey($: EngineInterface): Promise<string | undefined> {
  if (config.typesafeKey && !keyFromFile) return config.typesafeKey
  const fromEnv = await envJevKey($)
  if (fromEnv) return fromEnv
  if (config.judge !== 'jev' && !keyFromFile) return undefined
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
  if (status === 401 || status === 403) return `${name} rejected the key (${status})`
  if (status === 402) return `${name} is out of credits (${status})`
  if (status === 429) return `${name} is rate limited (${status})`
  return `${name} failed (${status})`
}
const warned = new Set<string>()
/** Tells the person once per session and reason that their judge failed and Haiku stands in. */
function warnJudge($: EngineInterface, reason: string) {
  void proof($, `judge fallback: ${reason}`)
  void update($, judgeDown, () => reason).then(() => $.ui.invalidate('ui.render'))
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
  /** A skill or slash command that writes the handoff instead of the built-in prompt, e.g. "session-handoff". */
  handoffSkill: string
  /** After the handoff lands in the fresh chat: carry on with the next step, or only confirm and wait. */
  handoffAfter: 'continue' | 'confirm'
  /** The effort slider, -2 (cheaper) to 2 (smarter): tips the judge's close calls that way. */
  bias: number
  /** Auto never goes below this effort. */
  floor: Effort
  /** Auto never goes above this effort. */
  ceiling: Effort
}
let config: JudgeConfig = {
  judge: 'auto',
  typesafeKey: '',
  customUrl: '',
  customModel: '',
  customKey: '',
  handoffSkill: '',
  handoffAfter: 'continue',
  bias: 0,
  floor: 'low',
  ceiling: 'max',
}

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
    handoffSkill: str(o.handoffSkill).replace(/^\//, ''),
    handoffAfter: str(o.handoffAfter) === 'confirm' ? 'confirm' : 'continue',
    bias: Math.max(-2, Math.min(2, Math.round(Number(str(o.effortBias)) || 0))),
    floor: EFFORTS.includes(str(o.effortFloor) as Effort) ? (str(o.effortFloor) as Effort) : 'low',
    ceiling: EFFORTS.includes(str(o.effortCeiling) as Effort) ? (str(o.effortCeiling) as Effort) : 'max',
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
    if (await read($, judgeDown)) await update($, judgeDown, () => null)
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
      if (await read($, judgeDown)) await update($, judgeDown, () => null)
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
// A chat is swamped once each request reads this much context (or half the window): every message re-reads it all.
const SWAMP_TOKENS = 150_000
const SWAMP_PERCENT = 50
// Closed, the band stays away until the context has grown this much more.
const SWAMP_REGROW = 50_000

/** Whether the context is swamped, from the status line's figures. Cheap: no counting, no model call. */
// A usage window this full shows the running-hot band.
const HOT_PERCENT = 80
// Closed, the running-hot band returns this many points later.
const HOT_REGROW = 10

/** The fullest of the 5-hour and weekly windows, once one passes HOT_PERCENT. Save mode ends with its window. */
async function checkHot($: EngineInterface, limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]) {
  const windows = limits.filter(l => l.kind === 'five_hour' || l.kind === 'seven_day')
  const top = windows.sort((a, b) => b.percentUsed - a.percentUsed)[0]
  const next = top && top.percentUsed >= HOT_PERCENT ? { kind: top.kind, percent: top.percentUsed, resetsAt: top.resetsAt ?? null } : null
  const was = await read($, hot)
  if (JSON.stringify(next) !== JSON.stringify(was)) {
    await update($, hot, () => next)
    $.ui.invalidate('ui.render')
  }
  const until = await read($, saveUntil)
  if (until !== null && (await $.clock.now()) >= until) await update($, saveUntil, () => null)
}

/** "14:20" for a reset time today, "Mon 14:20" further out. */
export function resetLabel(iso: string | null, now: number): string {
  if (!iso) return ''
  const at = new Date(iso)
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return at.getTime() - now < 20 * 3600_000 ? hm : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getDay()]} ${hm}`
}

/**
 * The effort slider tips close calls only: a verdict the judge was unsure of moves one step toward cheaper or smarter.
 * The outer stops count more calls as close. A sure verdict, or one without a confidence, stays as it is.
 */
export function tipped(effort: Effort, sure: number | undefined, bias: number): Effort {
  if (!bias || sure === undefined || sure >= (Math.abs(bias) === 1 ? 0.65 : 0.85)) return effort
  const i = Math.max(0, Math.min(EFFORTS.length - 1, EFFORTS.indexOf(effort) + Math.sign(bias)))
  return EFFORTS[i]
}

/** Floor and ceiling from the settings: what Auto picks stays between them. */
export function bounded(effort: Effort, floor: Effort, ceiling: Effort): Effort {
  const lo = EFFORTS.indexOf(floor)
  const hi = Math.max(lo, EFFORTS.indexOf(ceiling))
  return EFFORTS[Math.max(lo, Math.min(hi, EFFORTS.indexOf(effort)))]
}

/** Save mode caps what Auto picks at medium; a higher pick comes down to it. */
export function capped(effort: Effort, saving: boolean): Effort {
  return saving && EFFORTS.indexOf(effort) > EFFORTS.indexOf('medium') ? 'medium' : effort
}

async function checkSwamp($: EngineInterface) {
  const { context, rateLimits } = await $.session.usage()
  await checkHot($, rateLimits ?? [])
  const tokens = context.tokens ?? 0
  const over = tokens >= SWAMP_TOKENS || (context.percent ?? 0) >= SWAMP_PERCENT
  const next = over ? tokens : null
  if (next !== (await read($, swamped))) {
    await update($, swamped, () => next)
    $.ui.invalidate('ui.render')
  }
}

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
    // The app's own /compact, run as if typed: nothing lands in the prompt box, nothing to send. It waits for the
    // session to be idle, where a direct $.session.compact() is refused whenever the app counts a turn as running.
    await $.command.run({ command: 'compact', args: '' })
    cacheExpires = 0
    await update($, cacheLeft, () => null)
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    void proof($, `compact failed: ${why}`)
    $.ui.toast(`effortless: compact failed: ${why.slice(0, 140)}`)
  } finally {
    await update($, isCompacting, () => false)
  }
}

// The handoff: one click writes a handoff, clears the chat and sends the handoff into it as the first message.
export const HANDOFF_PROMPT =
  'Write a handoff so this work can continue in a fresh chat that has no other context. Cover: the goal; what is ' +
  'done, with file paths; what is half done; the exact next steps; decisions made and why; and anything that must ' +
  'not be redone or broken. Be concrete and complete. Reply with the handoff only, no preamble.'

/** The first message of the fresh chat: the handoff, then what to do with it. */
export function handoffMessage(handoff: string, after: 'continue' | 'confirm'): string {
  const ask =
    after === 'continue'
      ? 'Continue with the next step.'
      : 'Read this, say in two lines where things stand and what is next, then wait for me.'
  return `Handoff from the previous chat:\n\n${handoff.trim()}\n\n${ask}`
}

// The handoff's text once its turn has ended, waiting for the chat to go idle so it can be cleared and resent.
let handoffText: string | undefined
let handoffDriving = false

/** Starts a handoff: asks for it (built-in prompt or the person's own skill); the rest follows when it is written. */
async function startHandoff($: EngineInterface) {
  if ((await read($, handoffStage)) !== null) return
  await update($, handoffStage, () => 'writing')
  try {
    if (config.handoffSkill) await $.command.run({ command: config.handoffSkill, args: '' })
    else await $.prompt.submit({ text: HANDOFF_PROMPT })
  } catch (error) {
    await update($, handoffStage, () => null)
    $.ui.toast(`effortless: handoff failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 140)}`)
  }
}

/** Clears the chat and sends the written handoff into it. Runs from the session's timer, when nothing waits on it. */
export async function finishHandoff($: EngineInterface) {
  if (handoffText === undefined || handoffDriving) return
  handoffDriving = true
  const text = handoffText
  handoffText = undefined
  try {
    await update($, handoffStage, () => 'clearing')
    await $.command.run({ command: 'clear', args: '' })
    await $.prompt.submit({ text: handoffMessage(text, config.handoffAfter) })
  } catch (error) {
    $.ui.toast(`effortless: handoff failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 140)}`)
  } finally {
    handoffDriving = false
    await update($, handoffStage, () => null)
  }
}

/** Opens the effortless settings panel above the prompt: the app does not let a plugin open its /plugin dialog. */
async function openPluginSettings($: EngineInterface) {
  await update($, settingsOpen, () => true)
  $.ui.invalidate('ui.render')
}

/** The settings rows the panel changes, by field: saved as the plugin's own setting and used at once. */
const SETTING_FIELDS = {
  judge: 'judge',
  bias: 'effortBias',
  floor: 'effortFloor',
  ceiling: 'effortCeiling',
  handoffAfter: 'handoffAfter',
  handoffSkill: 'handoffSkill',
  customUrl: 'customUrl',
  customModel: 'customModel',
} as const

async function saveSetting($: EngineInterface, field: keyof typeof SETTING_FIELDS, value: string) {
  const { deny } = await $.config
    .set({ key: `effortless.${SETTING_FIELDS[field]}`, value })
    .catch((error: unknown) => ({ deny: error instanceof Error ? error.message : String(error) }))
  if (deny) $.ui.toast(`effortless: could not save ${field}: ${String(deny).slice(0, 120)}`)
  const raw: Record<string, unknown> = {
    judge: config.judge,
    effortBias: String(config.bias),
    effortFloor: config.floor,
    effortCeiling: config.ceiling,
    handoffAfter: config.handoffAfter,
    handoffSkill: config.handoffSkill,
    customUrl: config.customUrl,
    customModel: config.customModel,
    [SETTING_FIELDS[field]]: value,
  }
  config = { ...readConfig(raw), typesafeKey: config.typesafeKey, customKey: config.customKey }
  $.ui.invalidate('ui.render')
}

/** Saves every change in the panel's draft, then closes the panel. Nothing changed applies before this. */
async function saveDraft($: EngineInterface) {
  const draft = await read($, settingsDraft)
  const { key, ...rest } = draft
  for (const field of Object.keys(SETTING_FIELDS) as (keyof typeof SETTING_FIELDS)[]) {
    const value = rest[field]
    if (value !== undefined) await saveSetting($, field, value)
  }
  if (key?.trim()) await saveJevKey($, key)
  await update($, settingsDraft, () => ({}))
  await update($, settingsOpen, () => false)
  $.ui.toast('effortless: settings saved.')
  $.ui.invalidate('ui.render')
}

/** A TYPESAFE_API_KEY line set in an .env file's text: replaced where it is, added where it is not. */
export function withJevKey(text: string, key: string): string {
  const line = `TYPESAFE_API_KEY=${key}`
  if (/^\s*TYPESAFE_API_KEY\s*=.*$/m.test(text)) return text.replace(/^\s*TYPESAFE_API_KEY\s*=.*$/m, line)
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
}

/**
 * A key pasted in the panel goes to ~/.config/jev/.env, the file the jev skills read: a plugin cannot write the
 * app's secret settings. From then on that file wins over an older key in the settings.
 */
async function saveJevKey($: EngineInterface, key: string) {
  const clean = key.trim()
  if (!clean) return
  const home = (await envUserProfile($)) ?? (await envHome($))
  if (!home) {
    $.ui.toast('effortless: no home folder found to save the key in.')
    return
  }
  const path = `${home}/.config/jev/.env`
  const before = await $.fs.read(path).catch(() => '')
  try {
    await $.fs.write(path, withJevKey(typeof before === 'string' ? before : '', clean))
  } catch (error) {
    $.ui.toast(`effortless: could not save the key: ${(error instanceof Error ? error.message : String(error)).slice(0, 120)}`)
    return
  }
  await $.store.set('keyFromFile', true)
  keyFromFile = true
  askJevFile = undefined
  if (config.judge !== 'jev') await saveSetting($, 'judge', 'jev')
  await update($, judgeDown, () => null)
  warned.clear()
  $.ui.toast('effortless: key saved. Jev judges from the next message.')
  $.ui.invalidate('ui.render')
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
  await Promise.all([update($, setupStep, () => null), update($, setupPending, () => false), $.store.set('setupDone', true)])
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

let handoffTimer: { cancel: () => void } | undefined
const HANDOFF_POLL_MS = 1000

export const register: Register = (on, options) => {
  config = readConfig(options)
  on('session.start', async ($, e, next) => {
    keyFromFile = (await $.store.get('keyFromFile')) === true
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
    $.clock.every(CACHE_TICK_MS, () => void checkSwamp($).catch(() => undefined))
    // A written handoff is cleared and resent from here: a hook the turn waits on may not run commands.
    handoffTimer?.cancel()
    handoffTimer = $.clock.every(HANDOFF_POLL_MS, () => void finishHandoff($).catch(() => undefined))
    // The first time the mod runs, the setup guide opens above the prompt.
    if ((await $.store.get('setupDone')) !== true) {
      await update($, setupStep, () => 'pick')
      await update($, setupPending, () => true)
    }
    // Clear the status entry older versions set.
    $.ui.status(undefined)
    await modelIs($, await $.session.model()).catch(() => undefined)
    await $.command.register({
      name: 'effortless',
      description: 'Handoff to a fresh chat: /effortless handoff. Try the bands: /effortless swamp, hot, down, cold. Settings: /effortless settings. Setup: /effortless setup. Judge test: /effortless bench. Auto on/off: /effortless auto. What Auto cost: /effortless stats. Try Compact: /effortless cold.',
    })
    return next(e)
  })

  // The handoff turn ended: keep its text; the session's timer clears the chat and sends it.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && (await read($, handoffStage)) === 'writing') {
      if (e.reason === 'answer' && e.answer.trim()) handoffText = e.answer
      else {
        await update($, handoffStage, () => null)
        $.ui.toast('effortless: the handoff was not written, nothing was cleared')
      }
    }
    return result
  })

  on('command.run', { command: 'effortless' }, async ($, e) => {
    const wanted = await read($, suggestion)
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto') {
      await toggleAutoEffort($)
      return { text: (await read($, isAuto)) ? 'Auto on: effort is picked for every prompt.' : 'Auto off: the effort is yours.' }
    }
    // A test aid: marks the cache cold now, so the Compact button can be tried without waiting out the hour.
    if (arg === 'hot') {
      // Shows the running-hot band now, to try it: the next check puts back the real figures.
      await update($, hotHidden, () => null)
      await update($, hot, () => ({ kind: 'five_hour', percent: 82, resetsAt: new Date(Date.now() + 2 * 3600_000).toISOString() }))
      $.ui.invalidate('ui.render')
      return { text: 'The running-hot band is showing now (a test). It goes away at the next check unless a limit really is close.' }
    }
    if (arg === 'down') {
      await update($, judgeDownHidden, () => null)
      await update($, judgeDown, () => 'Jev is out of credits (402)')
      $.ui.invalidate('ui.render')
      return { text: 'The judge-down band is showing now (a test). It goes away once the judge answers again.' }
    }
    if (arg === 'swamp') {
      // Shows the swamp band now, to try it: the next check puts back the real figure.
      await update($, swampHiddenAt, () => null)
      await update($, swamped, () => SWAMP_TOKENS)
      $.ui.invalidate('ui.render')
      return { text: 'The swamp band is showing now (a test). It goes away at the next check unless the chat really is swamped.' }
    }
    if (arg === 'handoff') {
      await startHandoff($)
      return { text: 'Writing the handoff. The chat is cleared and continues from it when it is done.' }
    }
    if (arg === 'settings') {
      await openPluginSettings($)
      return { text: 'The effortless settings are open above the prompt.' }
    }
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
          const saving = (await read($, saveUntil)) !== null
          const leaned = bounded(tipped(verdict.effort, verdict.sure, config.bias), config.floor, config.ceiling)
          const effort = capped(leaned, saving)
          const why = effort !== leaned ? 'save mode' : leaned !== verdict.effort ? 'your settings' : verdict.why
          const applied: Pick = { ...verdict, model: inUse, effort, why }
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
    const handoffNow = (await read($, handoffStage)) !== null
    const needsSetup = await read($, setupPending)
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
        {/* Until a judge is picked the footer offers the setup; one click opens it above the prompt. */}
        {needsSetup ? (
          <Button
            key="setup"
            plain
            label=" Setup "
            hover={{ scope: 'setup', backgroundColor: HOVER_BOX }}
            onPress={async () => {
              await update($, setupStep, () => 'pick')
              $.ui.invalidate('ui.render')
            }}
          />
        ) : null}
        {/* Hand off: write a handoff, clear the chat, continue from it. One symbol, so it takes little room. */}
        <Button
          key="handoff"
          plain
          dimColor
          label={handoffNow ? ' … ' : ' ⇥ '}
          hover={{ scope: 'handoff', backgroundColor: HOVER_BOX }}
          onPress={() => startHandoff($)}
        />
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
    // The settings panel: a branded header bar, then one compact row per setting, a dim hint at the end of each row.
    if (await read($, settingsOpen)) {
      const { Input, Select } = $.ui.resolve(e)
      const opts = (values: readonly string[]) => values.map(value => ({ value, label: value }))
      const hasKey = Boolean(await jevKey($).catch(() => undefined)) || Boolean(await typesafeKeyAnywhere($).catch(() => undefined))
      // A plain button with its own handler: a dismiss-role button may be taken by the app before onPress runs.
      const close = async () => {
        await update($, settingsDraft, () => ({}))
        await update($, settingsOpen, () => false)
        $.ui.invalidate('ui.render')
      }
      // The panel shows the draft over the saved settings; every control writes to the draft only.
      const draft = await read($, settingsDraft)
      const set = (field: keyof SettingsDraft) => async (value: string) => {
        await update($, settingsDraft, d => ({ ...d, [field]: value }))
        $.ui.invalidate('ui.render')
      }
      const shown = {
        bias: draft.bias !== undefined ? Number(draft.bias) : config.bias,
        floor: (draft.floor ?? config.floor) as Effort,
        ceiling: (draft.ceiling ?? config.ceiling) as Effort,
        judge: (draft.judge ?? config.judge) as JudgeConfig['judge'],
        handoffAfter: draft.handoffAfter ?? config.handoffAfter,
        handoffSkill: draft.handoffSkill ?? config.handoffSkill,
        customUrl: draft.customUrl ?? config.customUrl,
        customModel: draft.customModel ?? config.customModel,
      }
      const dirty = Object.keys(draft).length > 0
      // The slider: five stops, the marker on the one in force. No animation, a click moves it.
      const track: unknown[] = []
      for (const n of [-2, -1, 0, 1, 2]) {
        if (n > -2) track.push(<Text key={`t${n}`} dimColor>──</Text>)
        track.push(<Button key={`bias${n + 2}`} plain label={n === shown.bias ? '◉' : '○'} onPress={() => set('bias')(String(n))} />)
      }
      const biasWords = ['Many close calls go a step down.', 'Close calls go a step down.', 'As the judge says.',
        'Close calls go a step up.', 'Many close calls go a step up.'][shown.bias + 2]
      const judgeWords = {
        auto: 'Jev with a key, else Haiku.',
        haiku: 'Your Claude login, no key.',
        jev: 'Most accurate. Key: typesafe.ai',
        custom: 'Its key: /plugin configure.',
      }[shown.judge]
      const row = (key: string, label: string, children: unknown[], words?: string) => (
        <Box key={key} flexDirection="row" gap={1} alignItems="center">
          <Box width={8} flexShrink={0}>
            <Text dimColor>{label}</Text>
          </Box>
          {children}
          {words ? (
            <Text key="hint" dimColor wrap="truncate">
              {words}
            </Text>
          ) : null}
        </Box>
      )
      const field = (key: string, input: unknown, width: number) => (
        <Box key={key} width={width} flexShrink={1}>
          {input}
        </Box>
      )
      // One column, a row per setting, its hint at the end. The header is three absolute layers, drawn in order (bar and
      // art, then the title, then the buttons): an absolute layer covers whatever is in the flow, so nothing of the
      // header is in the flow but a spacer that keeps its row free.
      return (
        <Box key="settings" position="relative" flexDirection="column" gap={1} paddingX={2} paddingBottom={1} overflow="hidden"
          backgroundColor={BRAND_BG} borderStyle="round" borderColor={BRAND_EDGE}>
          <Box key="settings-bar" position="absolute" top={-1} left={0} right={0} height={2} overflow="hidden" backgroundColor={BRAND_HEAD}>
            <Box key="settings-art" position="absolute" top={0} right={0} bottom={0}>
              <Svg source={BRAND_SVG} alt="effortless" width={FROST_WIDTH} height={FROST_HEIGHT} isInteractive />
            </Box>
          </Box>
          <Box key="settings-title" position="absolute" top={0} left={1} flexDirection="row" alignItems="center">
            <Text color={ACCENT} bold>
              ✦ effortless settings
            </Text>
            {dirty ? <Text dimColor> · unsaved changes</Text> : null}
          </Box>
          <Box key="settings-actions" position="absolute" top={0} right={1} flexDirection="row" gap={2} alignItems="center">
            <Button key="settings-save" variant="primary" label="Save" onPress={() => saveDraft($)} />
            <Button key="settings-close" plain label="✕" onPress={close} />
          </Box>
          <Box key="settings-spacer" height={1} />
          {row('settings-bias', 'Effort', [
            <Text key="cheap" dimColor>Cheaper</Text>,
            <Box key="track" flexDirection="row" alignItems="center">
              {track}
            </Box>,
            <Text key="smart" dimColor>Smarter</Text>,
          ], biasWords)}
          {row('settings-range', 'Limits', [
            <Select key="settings-floor" label="Min" value={shown.floor} options={opts(EFFORTS)} onSelect={set('floor')} />,
            <Select key="settings-ceiling" label="Max" value={shown.ceiling} options={opts(EFFORTS)} onSelect={set('ceiling')} />,
          ], 'Auto stays between these.')}
          {row('settings-judge', 'Judge', [
            <Select key="settings-judge-pick" value={shown.judge} options={opts(['auto', 'haiku', 'jev', 'custom'])}
              onSelect={set('judge')} />,
            ...(shown.judge === 'jev' || shown.judge === 'auto'
              ? [field('key-field', <Input key="settings-key" placeholder={hasKey ? 'Key saved. Paste to replace' : 'Paste TypeSafe key'}
                  value={draft.key ?? ''} submitLabel="ok" onInput={set('key')} onSubmit={set('key')} />, 30)]
              : []),
            ...(shown.judge === 'custom'
              ? [
                  field('url-field', <Input key="settings-url" placeholder="Chat completions URL" value={shown.customUrl} submitLabel="ok"
                    onInput={set('customUrl')} onSubmit={set('customUrl')} />, 30),
                  field('model-field', <Input key="settings-model" placeholder="Model" value={shown.customModel} submitLabel="ok"
                    onInput={set('customModel')} onSubmit={set('customModel')} />, 16),
                ]
              : []),
          ], judgeWords)}
          {row('settings-handoff', 'Handoff', [
            <Select key="settings-after-pick" value={shown.handoffAfter}
              options={[{ value: 'continue', label: 'then carry on' }, { value: 'confirm', label: 'then wait' }]}
              onSelect={set('handoffAfter')} />,
            field('skill-field', <Input key="settings-skill" placeholder="Built-in, or a skill name" value={shown.handoffSkill}
              submitLabel="ok" onInput={set('handoffSkill')} onSubmit={set('handoffSkill')} />, 30),
          ], 'The ⇥ button.')}
        </Box>
      )
    }
    // The setup guide, one step at a time: pick a judge, then only what that judge needs.
    const step = await read($, setupStep)
    if (step) {
      const openSettings = () => openPluginSettings($)
      // The same build as the cold band: one styled surface, the art a backdrop layer behind the right side, and the
      // buttons in a later layer so they are drawn on top of it. The text keeps clear of them with a spacer.
      // The ✕ closes the guide without picking: the footer keeps offering "Setup" until a judge is picked.
      const close = <Button key="setup-close" plain role="dismiss" label="✕" onPress={() => update($, setupStep, () => null)} />
      const band = (words: string, buttons: unknown[]) => (
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
          <Box flexGrow={1} minWidth={38} />
          <Box key="setup-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={2} alignItems="center">
            {buttons}
            {close}
          </Box>
        </Box>
      )
      if (step === 'pick')
        return band(
          'Who picks the effort?',
          [
            // Each mark sits tight against its own button; the pairs stand apart.
            <Box key="pick-jev" flexDirection="row" gap={1} alignItems="center">
              <Svg source={TYPESAFE_MARK} alt="TypeSafe" width={12} height={18} />
              <Button key="setup-jev" variant="primary" label="Jev (API)" onPress={() => pickJudge($, 'jev')} />
            </Box>,
            <Box key="pick-haiku" flexDirection="row" gap={1} alignItems="center">
              <Svg source={CLAUDE_MARK} alt="Claude" width={16} height={16} />
              <Button key="setup-haiku" variant="primary" label="Haiku (no key)" onPress={() => pickJudge($, 'haiku')} />
            </Box>,
          ],
        )
      return band(
        step === 'jev' ? 'Paste a TypeSafe key (typesafe.ai) in the settings.' : 'Fill in the URL and model in the settings.',
        [
          <Button
            key="setup-open"
            variant="primary"
            label="Open settings"
            onPress={async () => {
              await finishSetup($)
              await openSettings()
            }}
          />,
          <Button
            key="setup-done"
            label="Done"
            onPress={() => finishSetup($, 'effortless: restart Claude Code so the new settings are used.')}
          />,
          <Button key="setup-back" plain label="Back" onPress={() => update($, setupStep, () => 'pick')} />
        ],
      )
    }
    // The judge the person picked is failing: Haiku stands in until it works again.
    const downReason = await read($, judgeDown)
    if (downReason && downReason !== (await read($, judgeDownHidden))) {
      return (
        <Box key="down" position="relative" flexDirection="row" gap={1} alignItems="center" paddingX={1} overflow="hidden"
          backgroundColor={SLATE_BG} borderStyle="round" borderColor={SLATE_EDGE}>
          <Box key="down-art" position="absolute" top={-1} right={0} bottom={-1}>
            <Svg source={DOWN_SVG} alt="judge down" width={FROST_WIDTH} height={FROST_HEIGHT} isInteractive />
          </Box>
          <Box flexShrink={0}>
            <Text color={SLATE} bold wrap="truncate">
              ✦ Judge down
            </Text>
          </Box>
          <Text wrap="truncate">{`${downReason}. Haiku stands in.`}</Text>
          <Box flexGrow={1} minWidth={30} />
          <Box key="down-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={1} alignItems="center">
            <Button key="down-settings" variant="primary" label="Open settings" onPress={() => openPluginSettings($)} />
            <Button key="down-close" plain role="dismiss" label="✕" onPress={() => update($, judgeDownHidden, () => downReason)} />
          </Box>
        </Box>
      )
    }
    // A usage limit is close: Save mode keeps Auto at medium or below until it resets.
    const heat = await read($, hot)
    const heatHidden = await read($, hotHidden)
    if (heat && (heatHidden === null || heat.percent >= heatHidden + HOT_REGROW)) {
      const saving = (await read($, saveUntil)) !== null
      const window = heat.kind === 'five_hour' ? '5h' : 'weekly'
      const resets = resetLabel(heat.resetsAt, await $.clock.now())
      return (
        <Box key="hot" position="relative" flexDirection="row" gap={1} alignItems="center" paddingX={1} overflow="hidden"
          backgroundColor={EMBER_BG} borderStyle="round" borderColor={EMBER_EDGE}>
          <Box key="ember" position="absolute" top={-1} right={0} bottom={-1}>
            <Svg source={EMBER_SVG} alt="embers" width={FROST_WIDTH} height={FROST_HEIGHT} isInteractive />
          </Box>
          <Box flexShrink={0}>
            <Text color={EMBER} bold wrap="truncate">
              ✦ Running hot
            </Text>
          </Box>
          <Text wrap="truncate">{`${Math.round(heat.percent)}% of your ${window} limit used${resets ? ` · resets ${resets}` : ''}`}</Text>
          <Box flexGrow={1} minWidth={30} />
          <Box key="hot-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={1} alignItems="center">
            <Button
              key="hot-save"
              variant="primary"
              label={saving ? 'Save mode on' : 'Save mode'}
              onPress={async () => {
                const until = heat.resetsAt ? new Date(heat.resetsAt).getTime() : (await $.clock.now()) + 5 * 3600_000
                await update($, saveUntil, () => (saving ? null : until))
                $.ui.toast(saving ? 'effortless: save mode off' : 'effortless: save mode on, Auto stays at medium or below until the limit resets')
              }}
            />
            <Button key="hot-close" plain role="dismiss" label="✕" onPress={() => update($, hotHidden, () => heat.percent)} />
          </Box>
        </Box>
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
              ✦ Chat went cold
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
    // The context is swamped: every message re-reads all of it. Compact or hand off, right here.
    const swampTokens = await read($, swamped)
    const hiddenAt = await read($, swampHiddenAt)
    if (swampTokens !== null && (hiddenAt === null || swampTokens >= hiddenAt + SWAMP_REGROW)) {
      const compacting = await read($, isCompacting)
      const handing = (await read($, handoffStage)) !== null
      return (
        <Box
          key="swamp"
          position="relative"
          flexDirection="row"
          gap={1}
          alignItems="center"
          paddingX={1}
          overflow="hidden"
          backgroundColor={BOG_BG}
          borderStyle="round"
          borderColor={BOG_EDGE}
        >
          <Box key="bog" position="absolute" top={-1} right={0} bottom={-1}>
            <Svg source={SWAMP_SVG} alt="swamp" width={FROST_WIDTH} height={FROST_HEIGHT} isInteractive />
          </Box>
          <Box flexShrink={0}>
            <Text color={BOG} bold wrap="truncate">
              ✦ Chat is getting swamped
            </Text>
          </Box>
          <Text wrap="truncate">{`${Math.round(swampTokens / 1000)}k tokens re-read every message.`}</Text>
          <Box flexGrow={1} minWidth={34} />
          <Box key="swamp-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={1} alignItems="center">
            <Button key="swamp-compact" variant="primary" hotkey="c" label={compacting ? 'Compacting…' : 'Compact'} onPress={() => compactCold($)} />
            <Button key="swamp-handoff" hotkey="h" label={handing ? 'Handing off…' : 'Handoff'} onPress={() => startHandoff($)} />
            <Button key="swamp-close" plain role="dismiss" label="✕" onPress={() => update($, swampHiddenAt, () => swampTokens)} />
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
