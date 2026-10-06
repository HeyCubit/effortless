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
  /** How sure the judge was of the effort, 0-1, when it said. */
  sure?: number
}

/** The settings panel's unsaved changes, by field, as the settings store them (strings). */
export type SettingsDraft = {
  bias?: string
  floor?: string
  ceiling?: string
  judge?: string
  handoffAfter?: string
  handoffSkill?: string
  customUrl?: string
  customModel?: string
  key?: string
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
      /** Why the picked judge is failing, or null. */
      judgeDown: string | null
      /** The reason the judge-down band was closed for. */
      judgeDownHidden: string | null
      /** The effortless settings panel is open above the prompt. */
      settingsOpen: boolean
      /** Changes made in the settings panel and not saved yet. */
      settingsDraft: SettingsDraft
      /** The fullest usage window once past 80%, or null. */
      hot: { kind: string; percent: number; resetsAt: string | null } | null
      /** Percent at which the running-hot band was closed. */
      hotHidden: number | null
      /** Save mode until this time (ms), or null. */
      saveUntil: number | null
      /** Context tokens read per request once the chat is swamped, else null. */
      swamped: number | null
      /** Tokens at which the swamp band was closed; it returns once the context grows well past it. */
      swampHiddenAt: number | null
      /** The first-run setup is not done yet. */
      setupPending: boolean
      /** Where a handoff is: null idle, writing, or clearing and resending. */
      handoffStage: 'writing' | 'clearing' | null
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
