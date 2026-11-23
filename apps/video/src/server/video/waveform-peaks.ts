/**
 * Turns decoded sound into the points the timeline draws: the loudest sample in
 * each slice, scaled so the loudest moment in the whole file is 255. Scaling to
 * the file rather than to full volume keeps a quiet voice-over readable; the
 * picture is about where the sound is, not how loud it is.
 */

const WAVEFORM_POINTS_PER_SECOND = 25
export const WAVEFORM_MAX_POINTS = 30_000

export function waveformPointCount(durationMs: number) {
  return Math.min(
    WAVEFORM_MAX_POINTS,
    Math.max(1, Math.round((durationMs / 1000) * WAVEFORM_POINTS_PER_SECOND))
  )
}

/** `pcm` is signed 16-bit little-endian mono, as ffmpeg's `s16le` writes it. */
export function waveformPeaks(pcm: Buffer, pointCount: number) {
  const sampleCount = Math.floor(pcm.byteLength / 2)
  const loudest = new Uint16Array(pointCount)
  let fileLoudest = 0
  for (let point = 0; point < pointCount; point += 1) {
    const from = Math.floor((point * sampleCount) / pointCount)
    const to = Math.max(
      from + 1,
      Math.floor(((point + 1) * sampleCount) / pointCount)
    )
    let peak = 0
    for (let sample = from; sample < to && sample < sampleCount; sample += 1) {
      const value = Math.abs(pcm.readInt16LE(sample * 2))
      if (value > peak) peak = value
    }
    loudest[point] = peak
    if (peak > fileLoudest) fileLoudest = peak
  }

  const peaks = new Uint8Array(pointCount)
  if (fileLoudest === 0) return peaks
  for (let point = 0; point < pointCount; point += 1) {
    peaks[point] = Math.round((loudest[point] / fileLoudest) * 255)
  }
  return peaks
}
