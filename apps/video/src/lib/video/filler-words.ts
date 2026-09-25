/**
 * The "um"s and "uh"s.
 *
 * Two very different things read this list: the window that offers which ones
 * to look for, and the server that works out which stretches of speech to cut.
 * It is plain maths on words and timings with nothing else attached, so it can
 * be checked without a video, a key or a server.
 */

/**
 * How sure we can be that hearing this word means it should go. Words that are
 * often real speech — "like", "so" — stay low, because the point of showing
 * the cuts before making them is catching exactly those.
 */
export type FillerConfidence = "low" | "medium" | "high"

export type FillerWordOption = {
  /** What is matched. A term with a space in it matches words in a row. */
  term: string
  label: string
  confidence: FillerConfidence
  /** Ticked to begin with. Kept to the three nobody argues about. */
  default: boolean
}

export const FILLER_WORD_OPTIONS: FillerWordOption[] = [
  { term: "um", label: "um", confidence: "high", default: true },
  { term: "uh", label: "uh", confidence: "high", default: true },
  { term: "like", label: "like", confidence: "low", default: true },
  { term: "er", label: "er", confidence: "high", default: false },
  { term: "erm", label: "erm", confidence: "high", default: false },
  { term: "hmm", label: "hmm", confidence: "high", default: false },
  { term: "you know", label: "you know", confidence: "low", default: false },
  { term: "i mean", label: "I mean", confidence: "low", default: false },
  { term: "so", label: "so", confidence: "low", default: false },
  { term: "well", label: "well", confidence: "low", default: false },
  { term: "right", label: "right", confidence: "low", default: false },
  { term: "actually", label: "actually", confidence: "medium", default: false },
  {
    term: "basically",
    label: "basically",
    confidence: "medium",
    default: false,
  },
  {
    term: "literally",
    label: "literally",
    confidence: "medium",
    default: false,
  },
]

const FILLER_WORD_TERMS = FILLER_WORD_OPTIONS.map((option) => option.term)

export const DEFAULT_FILLER_TERMS = FILLER_WORD_OPTIONS.filter(
  (option) => option.default
).map((option) => option.term)

export type FillerWord = {
  text: string
  startMs: number
  endMs: number
}

export type FillerRange = {
  startMs: number
  endMs: number
  term: string
  confidence: FillerConfidence
}

/**
 * Down to bare letters, so "Um,", "uh…" and "like." all match their term.
 */
function normalizeFillerText(text: string) {
  return text.toLowerCase().replace(/[^a-z']/g, "")
}

/**
 * Keeps only terms from the list above. What the browser asks for is never
 * taken at its word.
 */
export function sanitizeFillerTerms(terms: readonly string[] | undefined) {
  const allowed = new Set(FILLER_WORD_TERMS)
  const seen = new Set<string>()
  const result: string[] = []
  for (const term of terms ?? []) {
    const normalized = term.trim().toLowerCase()
    if (allowed.has(normalized) && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  return result
}

/**
 * Every stretch of speech that is one of the chosen words.
 *
 * A term made of several words has to match those words in a row, and the
 * longest match wins — "you know" is one thing to cut, not a "you" and a
 * "know". Nothing is joined up: one occurrence is one cut somebody can look at
 * and keep.
 */
export function detectFillerRanges(
  words: FillerWord[],
  selectedTerms: readonly string[]
): FillerRange[] {
  const selected = new Set(selectedTerms)
  const phrases = FILLER_WORD_OPTIONS.filter((option) =>
    selected.has(option.term)
  )
    .map((option) => ({ ...option, tokens: option.term.split(" ") }))
    .sort((a, b) => b.tokens.length - a.tokens.length)
  if (!phrases.length) return []

  const normalized = words.map((word) => normalizeFillerText(word.text))
  const ranges: FillerRange[] = []
  let index = 0
  while (index < words.length) {
    const match = phrases.find((phrase) => {
      if (index + phrase.tokens.length > words.length) return false
      return phrase.tokens.every(
        (token, offset) => normalized[index + offset] === token
      )
    })
    if (!match) {
      index += 1
      continue
    }
    const startMs = words[index].startMs
    const endMs = words[index + match.tokens.length - 1].endMs
    if (endMs > startMs) {
      ranges.push({
        startMs,
        endMs,
        term: match.term,
        confidence: match.confidence,
      })
    }
    index += match.tokens.length
  }
  return ranges
}
