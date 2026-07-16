// Generates the curated ambient loops in public/pomoder/audio-*.mp3.
// Every sound is synthesized from scratch here, so the catalog ships fully
// licensed first-party audio. Rerun with: node scripts/generate-curated-sounds.mjs
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const SAMPLE_RATE = 44100
const LOOP_CROSSFADE_SECONDS = 3
const outputFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/pomoder")

function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function makeLoop(seconds, fill) {
  const fadeSamples = LOOP_CROSSFADE_SECONDS * SAMPLE_RATE
  const total = Math.round(seconds * SAMPLE_RATE) + fadeSamples
  const raw = new Float32Array(total)
  fill(raw)
  const body = raw.subarray(0, total - fadeSamples)
  for (let i = 0; i < fadeSamples; i++) {
    const mix = i / fadeSamples
    body[i] = body[i] * Math.sqrt(mix) + raw[total - fadeSamples + i] * Math.sqrt(1 - mix)
  }
  return normalize(body)
}

function normalize(buffer, targetRms = 0.16, peakCeiling = 0.85) {
  let sum = 0
  for (const sample of buffer) sum += sample * sample
  const gain = targetRms / Math.max(1e-9, Math.sqrt(sum / buffer.length))
  let peak = 0
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample * gain))
  const limited = peak > peakCeiling ? gain * (peakCeiling / peak) : gain
  const out = new Float32Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] * limited
  return out
}

function onePole(cutoffHz) {
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / SAMPLE_RATE)
  let state = 0
  return (input) => (state += alpha * (input - state))
}

function addDecayingTone(buffer, startSample, frequency, seconds, amplitude, partials = [[1, 1]]) {
  const length = Math.min(buffer.length - startSample, Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < length; i++) {
    const time = i / SAMPLE_RATE
    const envelope = Math.exp((-4 * i) / length) * Math.min(1, i / 220)
    let sample = 0
    for (const [ratio, weight] of partials) sample += weight * Math.sin(2 * Math.PI * frequency * ratio * time)
    buffer[startSample + i] += sample * envelope * amplitude
  }
}

const generators = {
  brown(buffer) {
    const random = createRandom(101)
    let last = 0
    const wobble = 2 * Math.PI * 0.07
    for (let i = 0; i < buffer.length; i++) {
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02
      buffer[i] = last * 3.5 * (1 + 0.12 * Math.sin((wobble * i) / SAMPLE_RATE))
    }
  },

  rain(buffer) {
    const random = createRandom(202)
    const hiss = onePole(1400)
    const body = onePole(320)
    for (let i = 0; i < buffer.length; i++) {
      const white = random() * 2 - 1
      buffer[i] = (white - hiss(white)) * 0.5 + body(white) * 0.35
    }
    for (let drop = 0; drop < buffer.length / SAMPLE_RATE * 22; drop++) {
      const start = Math.floor(random() * (buffer.length - 2000))
      const frequency = 1800 + random() * 3600
      addDecayingTone(buffer, start, frequency, 0.03 + random() * 0.05, 0.05 + random() * 0.08)
    }
  },

  cafe(buffer) {
    const random = createRandom(303)
    const murmurLow = onePole(180)
    const murmurMid = onePole(700)
    let last = 0
    for (let i = 0; i < buffer.length; i++) {
      const time = i / SAMPLE_RATE
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02
      const talk = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.11 * time) * Math.sin(2 * Math.PI * 0.043 * time + 1.7)
      const voiceBand = murmurMid(random() * 2 - 1) - murmurLow(random() * 2 - 1)
      buffer[i] = last * 2.6 * talk + voiceBand * 0.5 * talk
    }
    for (let clink = 0; clink < buffer.length / SAMPLE_RATE * 0.5; clink++) {
      const start = Math.floor(random() * (buffer.length - 9000))
      const frequency = 2200 + random() * 2600
      addDecayingTone(buffer, start, frequency, 0.12 + random() * 0.1, 0.03 + random() * 0.045, [[1, 1], [2.76, 0.4]])
    }
  },

  lofi(buffer) {
    const random = createRandom(404)
    const beatSeconds = 60 / 72
    const chords = [
      [174.61, 220, 261.63, 329.63], // Fmaj7
      [164.81, 196, 246.94, 293.66], // Em7
      [146.83, 174.61, 220, 261.63], // Dm7
      [130.81, 164.81, 196, 246.94], // Cmaj7
    ]
    const totalBeats = Math.ceil(buffer.length / SAMPLE_RATE / beatSeconds)
    for (let beat = 0; beat < totalBeats; beat++) {
      const start = Math.round(beat * beatSeconds * SAMPLE_RATE)
      const chord = chords[Math.floor(beat / 8) % chords.length]
      if (beat % 8 === 0) for (const note of chord) addDecayingTone(buffer, start, note, beatSeconds * 7.6, 0.075, [[1, 1], [2, 0.28], [3, 0.09]])
      if (beat % 2 === 0) {
        const kickLength = Math.round(0.14 * SAMPLE_RATE)
        for (let i = 0; i < kickLength && start + i < buffer.length; i++) {
          const time = i / SAMPLE_RATE
          buffer[start + i] += Math.sin(2 * Math.PI * (54 + 68 * Math.exp(-time * 34)) * time) * Math.exp(-time * 22) * 0.5
        }
      }
      if (beat % 4 === 2) {
        const snareStart = start
        const snareLength = Math.round(0.11 * SAMPLE_RATE)
        const snap = onePole(2100)
        for (let i = 0; i < snareLength && snareStart + i < buffer.length; i++) {
          const white = random() * 2 - 1
          buffer[snareStart + i] += (white - snap(white)) * Math.exp((-9 * i) / snareLength) * 0.24
        }
      }
      for (const swung of [0, 0.52]) {
        const hatStart = Math.round((beat + swung) * beatSeconds * SAMPLE_RATE)
        const hatLength = Math.round(0.028 * SAMPLE_RATE)
        const sizzle = onePole(6200)
        for (let i = 0; i < hatLength && hatStart + i < buffer.length; i++) {
          const white = random() * 2 - 1
          buffer[hatStart + i] += (white - sizzle(white)) * Math.exp((-7 * i) / hatLength) * 0.05
        }
      }
    }
    const warmth = onePole(3400)
    for (let i = 0; i < buffer.length; i++) {
      const crackle = random() < 0.0011 ? (random() * 2 - 1) * 0.09 : 0
      buffer[i] = warmth(buffer[i]) + crackle + (random() * 2 - 1) * 0.004
    }
  },

  forest(buffer) {
    const random = createRandom(505)
    const wind = onePole(240)
    for (let i = 0; i < buffer.length; i++) {
      const time = i / SAMPLE_RATE
      const gust = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.05 * time + Math.sin(2 * Math.PI * 0.013 * time) * 2)
      buffer[i] = wind(random() * 2 - 1) * 0.85 * gust
    }
    for (let bird = 0; bird < buffer.length / SAMPLE_RATE * 0.85; bird++) {
      const phraseStart = Math.floor(random() * (buffer.length - SAMPLE_RATE))
      const base = 2100 + random() * 2200
      const notes = 2 + Math.floor(random() * 4)
      for (let note = 0; note < notes; note++) {
        const start = phraseStart + Math.round(note * (0.09 + random() * 0.07) * SAMPLE_RATE)
        const length = Math.round((0.05 + random() * 0.06) * SAMPLE_RATE)
        const sweep = (random() - 0.35) * 900
        for (let i = 0; i < length && start + i < buffer.length; i++) {
          const time = i / SAMPLE_RATE
          const envelope = Math.sin((Math.PI * i) / length) ** 2
          buffer[start + i] += Math.sin(2 * Math.PI * (base + sweep * time + 90 * Math.sin(2 * Math.PI * 38 * time)) * time) * envelope * 0.055
        }
      }
    }
  },

  ocean(buffer) {
    const random = createRandom(606)
    const swell = onePole(420)
    const wash = onePole(900)
    for (let i = 0; i < buffer.length; i++) {
      const time = i / SAMPLE_RATE
      const waveA = Math.max(0, Math.sin(2 * Math.PI * time / 11)) ** 2.2
      const waveB = Math.max(0, Math.sin(2 * Math.PI * time / 7.3 + 2.4)) ** 2.2
      const white = random() * 2 - 1
      buffer[i] = swell(white) * (0.35 + waveA * 1.15 + waveB * 0.8) + wash(white) * 0.16
    }
  },

  fire(buffer) {
    const random = createRandom(707)
    const rumble = onePole(140)
    const bodyFilter = onePole(1100)
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = rumble(random() * 2 - 1) * 1.15
      if (random() < 0.0018) {
        const length = Math.round((0.004 + random() * 0.03) * SAMPLE_RATE)
        const loudness = 0.14 + random() * 0.35
        for (let j = 0; j < length && i + j < buffer.length; j++) {
          buffer[i + j] += bodyFilter(random() * 2 - 1) * Math.exp((-6 * j) / length) * loudness
        }
      }
    }
  },

  piano(buffer) {
    const random = createRandom(808)
    const beatSeconds = 1 // 60 BPM
    const chords = [
      [130.81, 196, 246.94, 329.63, 392], // Cmaj9
      [110, 164.81, 261.63, 329.63, 392], // Am7 add11
      [87.31, 174.61, 220, 261.63, 349.23], // Fmaj7
      [98, 196, 246.94, 293.66, 392], // G6
    ]
    const totalBeats = Math.ceil(buffer.length / SAMPLE_RATE / beatSeconds)
    for (let beat = 0; beat < totalBeats; beat++) {
      const chord = chords[Math.floor(beat / 4) % chords.length]
      const note = chord[beat % 4 === 0 ? 0 : 1 + Math.floor(random() * (chord.length - 1))]
      const start = Math.round((beat + random() * 0.03) * beatSeconds * SAMPLE_RATE)
      const partials = [[1, 1], [2.001, 0.42], [3.004, 0.16], [4.01, 0.07]]
      addDecayingTone(buffer, start, note, 4.6, beat % 4 === 0 ? 0.16 : 0.11, partials)
      if (beat % 4 === 0) addDecayingTone(buffer, start, note * 2, 3.8, 0.05, partials)
    }
    const echo = new Float32Array(Math.round(0.31 * SAMPLE_RATE))
    let index = 0
    for (let i = 0; i < buffer.length; i++) {
      const delayed = echo[index]
      echo[index] = buffer[i] + delayed * 0.35
      buffer[i] += delayed * 0.22
      index = (index + 1) % echo.length
    }
  },
}

const durations = { brown: 45, rain: 45, cafe: 50, lofi: 640 / 12, forest: 50, ocean: 44, fire: 45, piano: 48 }

function toWav(samples) {
  const data = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) data[i] = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767)
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + data.byteLength, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(data.byteLength, 40)
  return Buffer.concat([header, Buffer.from(data.buffer)])
}

const workFolder = await mkdtemp(path.join(tmpdir(), "pomoder-sounds-"))
try {
  for (const [key, generate] of Object.entries(generators)) {
    const samples = makeLoop(durations[key], generate)
    const wavPath = path.join(workFolder, `${key}.wav`)
    await writeFile(wavPath, toWav(samples))
    const mp3Path = path.join(outputFolder, `audio-${key}.mp3`)
    await run("ffmpeg", ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "112k", "-ac", "1", mp3Path], { timeout: 120_000 })
    console.log(`generated ${path.basename(mp3Path)} (${Math.round(durations[key])}s)`)
  }
} finally {
  await rm(workFolder, { recursive: true, force: true })
}
