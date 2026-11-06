/**
 * A voiceover you record yourself, on both sides of the wire
 * (workspace/docs/record-a-voiceover.md).
 *
 * The browser turns the take into a WAV file before sending it: one channel,
 * 32,000 samples a second. A WAV says exactly how long it runs, so the
 * website needs no ffmpeg to measure it, Whisper reads it as it is, and the
 * editor can jump around in it. The browser's own recordings often say none
 * of that.
 */

export const RECORDING_MAX_MS = 5 * 60_000
export const RECORDING_SAMPLE_RATE = 32_000

/** Two bytes a sample, one channel. Five minutes is about 19 MB. */
const BYTES_PER_SECOND = RECORDING_SAMPLE_RATE * 2
const WAV_HEADER_BYTES = 44
/** A second over the limit is allowed for the time Stop takes to land. */
const RECORDING_SLACK_MS = 1_000
export const RECORDING_MAX_BYTES =
  WAV_HEADER_BYTES + (BYTES_PER_SECOND * (RECORDING_MAX_MS + RECORDING_SLACK_MS)) / 1000

/**
 * What a recording is kept on the shelf as. The shelf needs a voice for every
 * voiceover; this one is the person's own, so it is never counted as the AI's.
 */
export const RECORDED_VOICE_ID = "own-recording"
export const RECORDED_VOICE_NAME = "Your recording"

export function isRecordedVoice(voiceId: string) {
  return voiceId === RECORDED_VOICE_ID
}

/** What the timing of a recording's words is filed under on the AI meter. */
export const RECORDING_CAPTIONS_FEATURE = "voiceover_recording"

export const RECORDING_MISSING_MESSAGE = "Record something first."
export const RECORDING_EMPTY_MESSAGE =
  "Nothing was recorded. Check the microphone is on and try again."
export const RECORDING_UNREADABLE_MESSAGE =
  "That recording could not be read. Record it again."
export const RECORDING_TOO_LONG_MESSAGE =
  "A recording can run up to 5 minutes. Record a shorter one."
export const RECORDING_NO_KEY_NOTICE =
  "Kept without captions, because no OpenAI key is saved in Settings → AI to write them."
export const RECORDING_UNTIMED_NOTICE =
  "Kept without captions, because Whisper could not write down the words this time."
export const RECORDING_HEARD_NOTHING_NOTICE =
  "Kept without captions, because Whisper heard no words in it."

/** The sentences fit to show as they are. */
export const RECORDING_MESSAGES = new Set([
  RECORDING_MISSING_MESSAGE,
  RECORDING_EMPTY_MESSAGE,
  RECORDING_UNREADABLE_MESSAGE,
  RECORDING_TOO_LONG_MESSAGE,
])

/** A WAV file of 16-bit sound from samples between -1 and 1. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2
  const bytes = new Uint8Array(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, "RIFF")
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // plain PCM
  view.setUint16(22, 1, true) // one channel
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, dataBytes, true)
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(
      WAV_HEADER_BYTES + i * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    )
  }
  return bytes
}

/**
 * How long a plain WAV file runs, from its own header, or null when it is not
 * one. The sound it claims must actually be there, so a header cannot claim a
 * length the file does not hold.
 */
export function wavDurationMs(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 12) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null

  let byteRate = 0
  let offset = 12
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.byteLength) return null
      // Only plain PCM is measured by its bytes.
      if (view.getUint16(body, true) !== 1) return null
      byteRate = view.getUint32(body + 8, true)
    } else if (id === "data") {
      if (!byteRate) return null
      const held = Math.min(size, bytes.byteLength - body)
      return Math.round((held / byteRate) * 1000)
    }
    offset = body + size + (size % 2)
  }
  return null
}

/** Why a recording of this many bytes and this length cannot be kept, or null. */
export function recordingRefusal(byteLength: number, durationMs: number | null) {
  if (!byteLength) return RECORDING_MISSING_MESSAGE
  if (byteLength > RECORDING_MAX_BYTES) return RECORDING_TOO_LONG_MESSAGE
  if (durationMs === null) return RECORDING_UNREADABLE_MESSAGE
  if (durationMs <= 0) return RECORDING_EMPTY_MESSAGE
  if (durationMs > RECORDING_MAX_MS + RECORDING_SLACK_MS) return RECORDING_TOO_LONG_MESSAGE
  return null
}
