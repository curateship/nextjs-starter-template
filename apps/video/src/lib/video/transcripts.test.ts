import { describe, expect, it } from "vitest"

import {
  hasSavedWords,
  joinTranscriptPieces,
  planTranscriptPieces,
  TRANSCRIPT_PIECE_MAX_MS,
  TRANSCRIPT_PIECE_OVERLAP_MS,
  transcribersServing,
  wordsInStretch,
  type FileWord,
} from "@/lib/video/transcripts"

const MINUTE = 60_000

/**
 * A fake talk: one word every 400ms, each 300ms long, named by its number so
 * a doubled or missing word is easy to spot.
 */
function talk(durationMs: number): FileWord[] {
  const words: FileWord[] = []
  for (let at = 0; at + 300 <= durationMs; at += 400) {
    words.push({ text: `w${at / 400}`, startMs: at, endMs: at + 300 })
  }
  return words
}

/**
 * What a transcriber hears of one piece: the talk's words inside it, timed
 * from the piece's start, nudged by `jitterMs` the way two requests never
 * agree to the millisecond. A word cut off by either end of the piece is not
 * heard at all.
 */
function hear(
  words: FileWord[],
  piece: { startMs: number; durationMs: number },
  jitterMs = 0
) {
  const endMs = piece.startMs + piece.durationMs
  return words
    .filter((word) => word.startMs >= piece.startMs && word.endMs <= endMs)
    .map((word) => ({
      text: word.text,
      startMs: word.startMs - piece.startMs + jitterMs,
      endMs: word.endMs - piece.startMs + jitterMs,
    }))
}

describe("planTranscriptPieces", () => {
  it("sends ten minutes or less as one piece", () => {
    expect(planTranscriptPieces(10 * MINUTE)).toEqual([
      { startMs: 0, durationMs: 10 * MINUTE },
    ])
  })

  it("shares 25 minutes out as three even pieces that overlap", () => {
    const pieces = planTranscriptPieces(25 * MINUTE)
    expect(pieces).toHaveLength(3)
    expect(pieces.map((piece) => piece.startMs)).toEqual([0, 500_000, 1_000_000])
    expect(pieces[0].durationMs).toBe(500_000 + TRANSCRIPT_PIECE_OVERLAP_MS)
    expect(pieces[1].durationMs).toBe(500_000 + TRANSCRIPT_PIECE_OVERLAP_MS)
    // The last one runs to the end and no further.
    expect(pieces[2].startMs + pieces[2].durationMs).toBe(25 * MINUTE)
  })

  it("never makes a piece longer than ten minutes plus the overlap", () => {
    for (const minutes of [10.01, 13, 20, 20.5, 29.9, 30]) {
      for (const piece of planTranscriptPieces(minutes * MINUTE)) {
        expect(piece.durationMs).toBeLessThanOrEqual(
          TRANSCRIPT_PIECE_MAX_MS + TRANSCRIPT_PIECE_OVERLAP_MS
        )
      }
    }
  })

  it("covers every millisecond of the file", () => {
    const total = 30 * MINUTE
    const pieces = planTranscriptPieces(total)
    expect(pieces[0].startMs).toBe(0)
    pieces.slice(1).forEach((piece, index) => {
      const before = pieces[index]
      expect(piece.startMs).toBeLessThan(before.startMs + before.durationMs)
    })
    expect(pieces.at(-1)!.startMs + pieces.at(-1)!.durationMs).toBe(total)
  })
})

describe("joinTranscriptPieces", () => {
  it("gives back every word once, in order, at the 10- and 20-minute seams", () => {
    const total = 25 * MINUTE
    const said = talk(total)
    const pieces = planTranscriptPieces(total).map((piece) => ({
      ...piece,
      words: hear(said, piece),
    }))
    const joined = joinTranscriptPieces(pieces)
    expect(joined.map((word) => word.text)).toEqual(said.map((word) => word.text))
    expect(joined).toEqual(said)
  })

  it("keeps one copy when the two pieces disagree by a few milliseconds", () => {
    const total = 21 * MINUTE
    const said = talk(total)
    const pieces = planTranscriptPieces(total).map((piece, index) => ({
      ...piece,
      // Every other piece hears each word a little late, then a little early.
      words: hear(said, piece, index % 2 ? 60 : -60),
    }))
    const texts = joinTranscriptPieces(pieces).map((word) => word.text)
    expect(texts).toEqual(said.map((word) => word.text))
  })

  it("keeps a word that sits right on the hand-over exactly once", () => {
    // Two pieces: 0 to 10s and 5s to 15s, so the hand-over is at 7.5s.
    const pieces = [
      {
        startMs: 0,
        durationMs: 10_000,
        words: [
          { text: "before", startMs: 6_800, endMs: 7_200 },
          // Centres at 7,450, just before the hand-over.
          { text: "seam", startMs: 7_300, endMs: 7_600 },
        ],
      },
      {
        startMs: 5_000,
        durationMs: 10_000,
        words: [
          { text: "before", startMs: 1_800, endMs: 2_200 },
          // The same word heard 100ms later, centring at 7,550.
          { text: "seam", startMs: 2_400, endMs: 2_700 },
          { text: "after", startMs: 3_000, endMs: 3_300 },
        ],
      },
    ]
    expect(joinTranscriptPieces(pieces).map((word) => word.text)).toEqual([
      "before",
      "seam",
      "after",
    ])
  })

  it("does not lose a word the earlier piece placed just past the hand-over", () => {
    const pieces = [
      {
        startMs: 0,
        durationMs: 10_000,
        words: [
          { text: "one", startMs: 6_800, endMs: 7_100 },
          // Centres at 7,550, past the hand-over, so this piece drops it.
          { text: "two", startMs: 7_400, endMs: 7_700 },
        ],
      },
      {
        startMs: 5_000,
        durationMs: 10_000,
        words: [
          { text: "one", startMs: 1_850, endMs: 2_150 },
          // The later piece hears it 100ms earlier, centring at 7,450.
          { text: "two", startMs: 2_300, endMs: 2_600 },
        ],
      },
    ]
    expect(joinTranscriptPieces(pieces).map((word) => word.text)).toEqual([
      "one",
      "two",
    ])
  })

  it("keeps a word said twice on purpose across the seam", () => {
    const pieces = [
      {
        startMs: 0,
        durationMs: 10_000,
        words: [{ text: "no", startMs: 7_000, endMs: 7_250 }],
      },
      {
        startMs: 5_000,
        durationMs: 10_000,
        words: [
          { text: "no", startMs: 2_000, endMs: 2_250 },
          { text: "no", startMs: 2_550, endMs: 2_800 },
        ],
      },
    ]
    expect(joinTranscriptPieces(pieces)).toEqual([
      { text: "no", startMs: 7_000, endMs: 7_250 },
      { text: "no", startMs: 7_550, endMs: 7_800 },
    ])
  })

  it("keeps the words of a piece the earlier one heard nothing in", () => {
    const pieces = [
      { startMs: 0, durationMs: 10_000, words: [] },
      {
        startMs: 5_000,
        durationMs: 10_000,
        words: [{ text: "late", startMs: 1_000, endMs: 1_300 }],
      },
    ]
    expect(joinTranscriptPieces(pieces)).toEqual([
      { text: "late", startMs: 6_000, endMs: 6_300 },
    ])
  })

  it("holds every time inside its own piece", () => {
    const joined = joinTranscriptPieces([
      {
        startMs: 0,
        durationMs: 1_000,
        words: [{ text: "over", startMs: 900, endMs: 1_400 }],
      },
    ])
    expect(joined).toEqual([{ text: "over", startMs: 900, endMs: 1_000 }])
  })
})

describe("wordsInStretch", () => {
  const words = [
    { text: "a", startMs: 0, endMs: 400 },
    { text: "b", startMs: 900, endMs: 1_300 },
    { text: "c", startMs: 2_000, endMs: 2_400 },
  ]

  it("takes the words whose middle falls in the stretch", () => {
    // b centres at 1,100, so a trim at 1,000 still keeps it.
    expect(wordsInStretch(words, 1_000, 2_100).map((word) => word.text)).toEqual([
      "b",
    ])
  })
})

describe("which saved words answer which run", () => {
  it("lets Whisper's measured words answer Gemini, never the other way round", () => {
    expect(transcribersServing("openai")).toEqual(["openai"])
    expect(transcribersServing("gemini")).toEqual(["gemini", "openai"])

    const geminiOnly = [{ mediaId: "m1", transcriber: "gemini" as const, durationMs: 1 }]
    expect(hasSavedWords(geminiOnly, "m1", "gemini")).toBe(true)
    expect(hasSavedWords(geminiOnly, "m1", "openai")).toBe(false)

    const whisperOnly = [{ mediaId: "m1", transcriber: "openai" as const, durationMs: 1 }]
    expect(hasSavedWords(whisperOnly, "m1", "gemini")).toBe(true)
    expect(hasSavedWords(whisperOnly, "m2", "gemini")).toBe(false)
  })
})
