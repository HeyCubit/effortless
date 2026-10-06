// Writes the progress bar's two chimes as 16-bit mono WAV files: node sounds/make-sounds.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const here = dirname(fileURLToPath(import.meta.url))

/** Notes as [frequency Hz, start s, length s]: a soft bell, a sine with a quiet octave, fading out. */
function chime(notes, seconds, gain = 0.32) {
  const samples = new Float32Array(Math.round(RATE * seconds))
  for (const [freq, start, length] of notes) {
    const from = Math.round(start * RATE)
    const count = Math.round(length * RATE)
    for (let i = 0; i < count && from + i < samples.length; i++) {
      const t = i / RATE
      const attack = Math.min(1, t / 0.008)
      const decay = Math.exp(-t * 5.5)
      const tone = Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t)
      samples[from + i] += tone * attack * decay * gain
    }
  }
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

// A question: two notes up, a fourth apart, like a raised voice at the end of a sentence.
writeFileSync(join(here, 'question.wav'), wav(chime([[659.25, 0, 0.5], [880, 0.14, 0.6]], 0.75)))
// Done: a major arpeggio up to the octave.
writeFileSync(join(here, 'done.wav'), wav(chime([[523.25, 0, 0.5], [659.25, 0.1, 0.5], [783.99, 0.2, 0.5], [1046.5, 0.3, 0.8]], 1.1, 0.22)))
