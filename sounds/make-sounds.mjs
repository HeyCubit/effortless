// Writes the progress bar's two chimes as 16-bit stereo WAV files: node sounds/make-sounds.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 44100
const here = dirname(fileURLToPath(import.meta.url))

/**
 * One soft bell note: a sine body with a little FM shimmer, a few inharmonic partials that die fast (the strike) and a
 * slow-beating detuned twin (the ring). Returns mono samples.
 */
function bell(freq, seconds, { bright = 1, decay = 2.6 } = {}) {
  const out = new Float32Array(Math.round(RATE * seconds))
  const partials = [
    [1, 1, decay],
    [2.0, 0.22 * bright, decay * 1.8],
    [2.76, 0.12 * bright, decay * 3.2],
    [5.4, 0.05 * bright, decay * 6],
  ]
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const attack = 1 - Math.exp(-t / 0.004)
    const fm = 0.35 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * freq * 3.5 * t)
    let s = 0
    for (const [ratio, amp, d] of partials) s += amp * Math.sin(2 * Math.PI * freq * ratio * t + (ratio === 1 ? fm : 0)) * Math.exp(-t * d)
    // The detuned twin beats slowly against the body, so the note rings instead of sitting still.
    s += 0.35 * Math.sin(2 * Math.PI * freq * 1.0035 * t) * Math.exp(-t * decay * 0.8)
    out[i] = s * attack
  }
  return out
}

/** A small stereo room: Schroeder combs and allpasses, slightly different per side. */
function room(mono, mix = 0.28) {
  const combsFor = side => [1557, 1617, 1491, 1422].map(n => Math.round((n + side * 23) * (RATE / 44100)))
  const allpass = [225, 556].map(n => Math.round(n * (RATE / 44100)))
  const side = s => {
    const wet = new Float32Array(mono.length)
    for (const d of combsFor(s)) {
      const buf = new Float32Array(d)
      let low = 0
      for (let i = 0, p = 0; i < mono.length; i++, p = (p + 1) % d) {
        const y = buf[p]
        low = y * 0.6 + low * 0.4
        buf[p] = mono[i] + low * 0.8
        wet[i] += y * 0.25
      }
    }
    for (const d of allpass) {
      const buf = new Float32Array(d)
      for (let i = 0, p = 0; i < wet.length; i++, p = (p + 1) % d) {
        const b = buf[p]
        const y = -wet[i] + b
        buf[p] = wet[i] + b * 0.5
        wet[i] = y
      }
    }
    return mono.map((v, i) => v * (1 - mix) + wet[i] * mix)
  }
  return [side(0), side(1)]
}

/** Notes as [frequency Hz, start s, pan -1..1, options]; the mix is placed, roomed and gently limited. */
function chime(notes, seconds, gain) {
  const L = new Float32Array(Math.round(RATE * seconds))
  const R = new Float32Array(L.length)
  for (const [freq, start, pan, opts] of notes) {
    const note = bell(freq, seconds - start, opts)
    const from = Math.round(start * RATE)
    const l = Math.cos(((pan + 1) * Math.PI) / 4)
    const r = Math.sin(((pan + 1) * Math.PI) / 4)
    for (let i = 0; i < note.length && from + i < L.length; i++) {
      L[from + i] += note[i] * l
      R[from + i] += note[i] * r
    }
  }
  const [wl] = room(L)
  const [, wr] = room(R)
  const peak = [...wl, ...wr].reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  const fadeFrom = L.length - Math.round(RATE * 0.25)
  return [wl, wr].map(ch =>
    ch.map((v, i) => {
      const fade = i > fadeFrom ? (L.length - i) / (L.length - fadeFrom) : 1
      return Math.tanh(((v / peak) * gain) * 1.2) * fade
    }),
  )
}

function wav([left, right]) {
  const data = Buffer.alloc(left.length * 4)
  for (let i = 0; i < left.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), i * 4)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), i * 4 + 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(2, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 4, 28)
  head.writeUInt16LE(4, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

// A question: a soft low note, then a brighter one a sixth above, like a voice rising at the end of a sentence.
writeFileSync(
  join(here, 'question.wav'),
  wav(chime([[440, 0, -0.25, { bright: 0.6, decay: 3.4 }], [739.99, 0.14, 0.25, { bright: 0.8, decay: 2.4 }]], 1.6, 0.42)),
)
// Done: a quick rising major arpeggio that blooms into a held chord with a high glint on top.
writeFileSync(
  join(here, 'done.wav'),
  wav(
    chime(
      [
        [523.25, 0, -0.4, { bright: 0.7, decay: 2.2 }],
        [659.25, 0.07, -0.15, { bright: 0.7, decay: 2.2 }],
        [783.99, 0.14, 0.15, { bright: 0.7, decay: 2 }],
        [1046.5, 0.21, 0.4, { bright: 0.9, decay: 1.6 }],
        [1567.98, 0.3, 0.1, { bright: 0.4, decay: 2.8 }],
      ],
      2.2,
      0.4,
    ),
  ),
)
