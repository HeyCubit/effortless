export type ModelKey = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** What the prompts Auto steered cost, measured: tokens by kind, and per effort the prompts and their weighted cost. */
export type Spent = {
  prompts: number
  requests: number
  input: number
  write: number
  read: number
  out: number
  byEffort: Partial<Record<Effort, { prompts: number; cost: number }>>
  /** How often each judge decided, the time it took in all (ms), and its tokens. */
  judge: { jev: number; haiku: number; custom: number; ms: number; tokens: number }
}

/** What the next turn runs with, and who decided it. */
export type Pick = {
  model: ModelKey
  effort: Effort
  /** A few words on why, shown dim in the band. */
  why: string
  by: 'jev' | 'haiku' | 'custom' | 'manual'
}

declare module 'claude-code' {
  interface PluginState {
    effortless: {
      /** Auto on effort: every prompt is judged and its effort applied. */
      isAuto: boolean
      /** The last change Auto made to the effort, shown for a moment as "Low → High". */
      switched: { from: Effort; to: Effort } | null
      /** What the prompts Auto steered cost this session, measured (see Spent). */
      saved: Spent
      /** The session runs a model where an effort change rewrites the prompt cache: Auto waits. */
      paused: boolean
      /** Whole minutes the prompt cache stays warm: null before the first response, 0 once cold. */
      cacheLeft: number | null
      /** A compaction started from the footer's Compact button is running. */
      isCompacting: boolean
      /** The cold band was closed until the cache goes cold again. */
      isColdHidden: boolean
      /** The setup guide's step, or null when it is closed. */
      setupStep: 'pick' | 'jev' | 'custom' | null
      /** Auto on model: the judge may suggest another model (never switched without a yes). Off by default. */
      isAutoModel: boolean
      pick: Pick | null
      isJudging: boolean
      suggestion: ModelKey | null
      /** The effort the person last set outside the mod (the app's control, their /effort): what the app shows. */
      appEffort: string | null
      /** The model the session runs now, as the engine last reported it (start, a switch, a request). */
      model: ModelKey | null
    }
  }
}
