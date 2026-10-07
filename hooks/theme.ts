// The look of the mod's accent: violet (the brand) or Claude orange. Every violet in the mod is one hex of the same
// family, so the theme turns them in one place instead of keeping two sets of colours: any #rrggbb in a violet hue is
// moved to the orange hue, neutrals and the other signal colours (green, yellow, red, blue) are left alone.

export type ThemeName = 'violet' | 'orange'
export const THEMES: readonly ThemeName[] = ['violet', 'orange']

let current: ThemeName = 'violet'
export const setTheme = (name: ThemeName) => {
  current = name
}
export const getTheme = () => current

/** The brand violet, the colour the rest of the family is turned from. */
export const VIOLET = '#a79cf7'

// Claude's orange (#d97757) sits at hue 15, saturation 63%, lightness 60%. The brand violet is lighter and stronger, so
// the saturation and the lightness of what turns come down to meet it.
const ORANGE_HUE = 15
const hexRe = /#[0-9a-fA-F]{6}\b/g
const memo = new Map<string, string>()

function toHsl(r: number, g: number, b: number): [number, number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return [h, s, l, d]
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

/** One hex in the current theme: violets turn orange, everything else stays. */
export function tintHex(hex: string): string {
  if (current === 'violet') return hex
  const key = hex.toLowerCase()
  const hit = memo.get(key)
  if (hit) return hit
  const n = parseInt(key.slice(1), 16)
  const [h, s, l, chroma] = toHsl((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  // Violet hues with real colour in them; the greys that lean blue (hardly any chroma or saturation) are not in the family.
  const out = h >= 235 && h <= 300 && chroma >= 0.03 && s >= 0.15 ? fromHsl(ORANGE_HUE, Math.min(1, s * 0.75), l > 0.5 ? Math.max(0.5, l - 0.19) : l) : hex
  memo.set(key, out)
  return out
}

/** Every hex in a string (an SVG, a style) in the current theme. */
export function tint(text: string): string {
  return current === 'violet' ? text : text.replace(hexRe, tintHex)
}

/** The accent as text colour. */
export const accent = () => tintHex(VIOLET)

type Component = (props: Record<string, unknown>) => unknown
const wrapped = new WeakMap<object, Component>()

/** The Svg element that draws its source in the theme. In violet it is the app's own, untouched. */
export function themedSvg<T>(Svg: T): T {
  if (current === 'violet' || typeof Svg !== 'function') return Svg
  let wrap = wrapped.get(Svg as object)
  if (!wrap) {
    const inner = Svg as unknown as Component
    wrap = props => inner(typeof props.source === 'string' ? { ...props, source: tint(props.source) } : props)
    wrapped.set(Svg as object, wrap)
  }
  return wrap as unknown as T
}

/** The parts `$.ui.resolve` hands over, with the Svg in the theme. Absent stays absent. */
export function themedEls<T extends object>(els: T): T {
  return 'Svg' in els ? { ...els, Svg: themedSvg((els as { Svg: unknown }).Svg) } : els
}
