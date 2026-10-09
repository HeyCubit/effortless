// The look of the mod's accent: violet (the brand) or Claude orange. Every violet in the mod is one hex of the same
// family, so the theme turns them in one place instead of keeping two sets of colours: any #rrggbb in a violet hue is
// moved to the orange hue, neutrals and the other signal colours (green, yellow, red, blue) are left alone.

export type ThemeName = 'violet' | 'orange' | 'rose'
export const THEMES: readonly ThemeName[] = ['violet', 'orange', 'rose']
// The hue each theme turns the violets to. Rose is a cherry-blossom pink; its sparkles are drawn as falling petals (see petals).
const HUES: Record<Exclude<ThemeName, 'violet'>, number> = { orange: 15, rose: 340 }

let current: ThemeName = 'violet'
export const setTheme = (name: ThemeName) => {
  // The turned colours are remembered per hex, so a new theme starts with none: orange's would show in rose.
  if (name !== current) memo.clear()
  current = name
}
export const getTheme = () => current

/** The brand violet, the colour the rest of the family is turned from. */
export const VIOLET = '#a79cf7'

// Claude's orange (#d97757) sits at hue 15, saturation 63%, lightness 60%. The brand violet is lighter and stronger, so
// the saturation and the lightness of what turns come down to meet it.
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
  const out = h >= 235 && h <= 300 && chroma >= 0.03 && s >= 0.15 ? fromHsl(HUES[current], Math.min(1, s * (current === 'rose' ? 0.9 : 0.75)), l > 0.5 ? Math.max(0.5, l - (current === 'rose' ? 0.08 : 0.19)) : l) : hex
  memo.set(key, out)
  return out
}

// A cherry-blossom petal, and the fall it makes: each sparkle of the art becomes a petal at the same place, falling slowly
// and turning as it goes. The drawing's own CSS animates sparkles in place; the petals bring their own.
const PETAL = 'M0 -2.2C1.7 -1.7 1.9 0.9 0 2.2C-1.9 0.9 -1.7 -1.7 0 -2.2Z'
const PETAL_CSS = '.pt{fill:#ffc9dc;opacity:0;animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}@keyframes fall{0%{opacity:0;transform:translate(0,-4px) rotate(0deg)}12%{opacity:.85}85%{opacity:.7}100%{opacity:0;transform:translate(-16px,34px) rotate(280deg)}}'
function petals(text: string): string {
  if (!text.includes('class="sp"')) return text
  return text
    .replace(/<path class="sp" style="transform-origin:([\d.]+)px [\d.]+px;animation-duration:([\d.]+)s;animation-delay:([\d.]+)s" d="[^"]*"\/>/g, (_m, x: string, dur: string, delay: string) =>
      `<g transform="translate(${x} 0)"><path class="pt" style="animation-duration:${(Number(dur) * 1.8).toFixed(1)}s;animation-delay:${delay}s" d="${PETAL}"/></g>`)
    .replace('</style>', `${PETAL_CSS}</style>`)
}

/** Every hex in a string (an SVG, a style) in the current theme. */
export function tint(text: string): string {
  if (current === 'violet') return text
  const turned = text.replace(hexRe, tintHex)
  return current === 'rose' ? petals(turned) : turned
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
