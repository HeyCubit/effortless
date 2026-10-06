// Writes the progress bar's two chimes as 16-bit mono WAV files: node sounds/make-sounds.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const here = dirname(fileURLToPath(import.meta.url))

/**
 * Notes as [frequency Hz, start s, length s]: a soft marimba-like tone (the fundamental, a quiet octave and a quick
 * woody overtone near 4x), a gentle attack, a long fade, and a faint echo. Quiet on purpose: a chime, not an alarm.
 */
function chime(notes, seconds, gain = 0.16) {
  const samples = new Float32Array(Math.round(RATE * seconds))
  for (const [freq, start, length] of notes) {
    const from = Math.round(start * RATE)
    const count = Math.round(length * RATE)
    for (let i = 0; i < count && from + i < samples.length; i++) {
      const t = i / RATE
      const attack = Math.min(1, t / 0.015)
      const body = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 3.2)
      const octave = 0.12 * Math.sin(4 * Math.PI * freq * t) * Math.exp(-t * 5)
      const wood = 0.18 * Math.sin(2 * Math.PI * freq * 3.93 * t) * Math.exp(-t * 28)
      samples[from + i] += (body + octave + wood) * attack * gain
    }
  }
  // A faint echo, so the note rings in a room instead of stopping dead.
  const delay = Math.round(0.11 * RATE)
  for (let i = samples.length - 1; i >= delay; i--) samples[i] += samples[i - delay] * 0.22
  return samples
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

// A question: two notes up a fourth, soft, like a raised voice at the end of a sentence.
writeFileSync(join(here, 'question.wav'), wav(chime([[587.33, 0, 0.9], [783.99, 0.16, 1.0]], 1.3)))
// Done: a gentle rising arpeggio that settles on the octave.
writeFileSync(join(here, 'done.wav'), wav(chime([[523.25, 0, 0.9], [659.25, 0.11, 0.9], [783.99, 0.22, 0.9], [1046.5, 0.33, 1.2]], 1.7, 0.12)))
