import type { TranscriberId } from "@/lib/video/ai-choices"

/**
 * Writing down a whole file once, on both sides of the wire.
 *
 * A file's words are saved the first time anything transcribes it, with their
 * times measured from the start of the FILE, not from any clip or timeline.
 * Captions, Tighten and the Words panel each take the stretch they need out of
 * those saved words, so the same recording is never paid for twice.
 *
 * Long sound is sent in pieces. Whisper takes 25 MB at most and the sound goes
 * as 16 kHz mono WAV, about 1.9 MB a minute, so one piece tops out near 13
 * minutes. Pieces of up to 10 minutes overlap by a few seconds so a word cut in
 * half at the end of one piece is heard whole in the next, and the join below
 * keeps one copy of every word.
 *
 * Nothing here talks to a provider or a database, so the browser can import it
 * and every awkward case is checkable on its own.
 */

/** One word as it was said, timed from the start of the file. */
export type FileWord = { text: string; startMs: number; endMs: number }

/** The longest recording that will be written down. */
export const TRANSCRIBE_MAX_SOURCE_MS = 30 * 60_000

/** The longest piece of sound sent off in one request. */
export const TRANSCRIPT_PIECE_MAX_MS = 10 * 60_000

/** How much each piece runs on into the next one. */
export const TRANSCRIPT_PIECE_OVERLAP_MS = 5_000

export type TranscriptPiece = { startMs: number; durationMs: number }

/**
 * Where to cut a file's sound so every piece fits in one request.
 *
 * Ten minutes or less is one piece. Anything longer is shared out evenly, so
 * a 25-minute talk is three pieces of about 8 minutes 20 rather than two of
 * ten and one of five. Every piece but the last runs on by the overlap.
 */
export function planTranscriptPieces(durationMs: number): TranscriptPiece[] {
  const total = Math.max(0, Math.round(durationMs))
  if (total <= TRANSCRIPT_PIECE_MAX_MS) return [{ startMs: 0, durationMs: total }]
  const count = Math.ceil(total / TRANSCRIPT_PIECE_MAX_MS)
  const step = Math.ceil(total / count)
  const pieces: TranscriptPiece[] = []
  for (let index = 0; index < count; index += 1) {
    const startMs = index * step
    if (startMs >= total) break
    const endMs = Math.min(total, startMs + step + TRANSCRIPT_PIECE_OVERLAP_MS)
    pieces.push({ startMs, durationMs: endMs - startMs })
  }
  return pieces
}

const middle = (word: FileWord) => (word.startMs + word.endMs) / 2

/** How much of the shorter of two words the other one covers, 0 to 1. */
function sharedShare(a: FileWord, b: FileWord) {
  const shared = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)
  const shorter = Math.max(1, Math.min(a.endMs - a.startMs, b.endMs - b.startMs))
  return Math.max(0, shared) / shorter
}

/**
 * The words of every piece as one list in file time.
 *
 * Each piece's words come back timed from the start of that piece, so the
 * piece's start is added first. Where two pieces overlap, the hand-over is the
 * middle of the overlap: the earlier piece keeps the words that centre before
 * it, because each of those has a few seconds of sound on both sides there.
 *
 * Two pieces hear the same word at slightly different times, so a word sitting
 * right on the hand-over could be kept twice or lost. The later piece's words
 * are only taken once they centre after the last word already kept, and never
 * when they cover more than half of that word, which is the same word heard
 * twice.
 */
export function joinTranscriptPieces(
  pieces: (TranscriptPiece & { words: FileWord[] })[]
): FileWord[] {
  const joined: FileWord[] = []
  pieces.forEach((piece, index) => {
    const next = pieces[index + 1]
    const pieceEndMs = piece.startMs + piece.durationMs
    const handOverMs = next ? (next.startMs + pieceEndMs) / 2 : Infinity
    const lastKept = joined.at(-1)
    const words = piece.words
      .map((word) => ({
        text: word.text,
        startMs: clamp(word.startMs + piece.startMs, piece.startMs, pieceEndMs),
        endMs: clamp(word.endMs + piece.startMs, piece.startMs, pieceEndMs),
      }))
      .filter((word) => word.text.trim() && word.endMs >= word.startMs)
      .sort((a, b) => a.startMs - b.startMs)
    for (const word of words) {
      if (middle(word) >= handOverMs) continue
      if (lastKept) {
        if (middle(word) <= middle(lastKept)) continue
        if (sharedShare(word, lastKept) > 0.5) continue
      }
      joined.push(word)
    }
  })
  return joined
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * The words said inside one stretch of the file, from `fromMs` up to `toMs`.
 * A word belongs to the stretch its middle falls in, so a word cut in half by
 * a trim goes to whichever side holds more of it.
 */
export function wordsInStretch(
  words: readonly FileWord[],
  fromMs: number,
  toMs: number
): FileWord[] {
  return words.filter((word) => {
    const at = middle(word)
    return at >= fromMs && at < toMs
  })
}

/**
 * Which saved transcripts may answer a run with this transcriber, best first.
 *
 * Whisper measures each word's time against the sound, and Gemini estimates
 * it. So a Whisper run only ever reads Whisper's saved words, while a Gemini
 * run reads its own and, failing that, Whisper's, which are better.
 */
export function transcribersServing(id: TranscriberId): TranscriberId[] {
  return id === "openai" ? ["openai"] : ["gemini", "openai"]
}

/** What the browser is told about one file's saved words. */
export type SavedTranscriptSummary = {
  mediaId: string
  transcriber: TranscriberId
  /** How long the file's sound is, as measured when it was written down. */
  durationMs: number
}

/** Whether a run with this transcriber would read saved words for this file. */
export function hasSavedWords(
  saved: readonly SavedTranscriptSummary[],
  mediaId: string,
  transcriber: TranscriberId
) {
  const serving = transcribersServing(transcriber)
  return saved.some(
    (row) => row.mediaId === mediaId && serving.includes(row.transcriber)
  )
}
