// Filler-word detection shared by the Jump Cut UI (which terms to offer) and
// the server analysis path (which spans to cut). Pure and dependency-free so it
// unit-tests without the ffmpeg/OpenAI server module.

// Matches JumpCutConfidence ("low" | "medium" | "high"). Ambiguous words that
// double as real speech ("like", "so") stay low so review-first can catch the
// false positives called out in the task's risks.
export type FillerConfidence = "low" | "medium" | "high"

export type FillerWordOption = {
  // Normalized match key; a space-separated key matches consecutive words
  // (e.g. "you know").
  term: string
  label: string
  confidence: FillerConfidence
  // Enabled by default in the picker. Kept to the classic "um / uh / like".
  default: boolean
}

// The offered catalog. Unambiguous hesitations are high confidence; discourse
// markers that are often legitimate speech stay low/medium and off by default.
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
  { term: "basically", label: "basically", confidence: "medium", default: false },
  { term: "literally", label: "literally", confidence: "medium", default: false },
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

// Lowercase and drop everything but letters/apostrophes so "Um,", "uh…", and
// "like." all match their catalog term.
function normalizeFillerText(text: string) {
  return text.toLowerCase().replace(/[^a-z']/g, "")
}

// Keep only catalog terms; used to sanitize the client's selection server-side.
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

// Scan the word list for the selected filler terms and return one range per
// occurrence. Multi-word phrases match consecutive words and are preferred over
// shorter matches so "you know" wins over a bare "you"/"know". No merging:
// callers keep one reviewable cut per occurrence.
export function detectFillerRanges(
  words: FillerWord[],
  selectedTerms: readonly string[]
): FillerRange[] {
  const selected = new Set(selectedTerms)
  const phrases = FILLER_WORD_OPTIONS.filter((option) =>
    selected.has(option.term)
  )
    .map((option) => ({ ...option, tokens: option.term.split(" ") }))
    // Longest phrases first so multi-word matches take priority.
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
