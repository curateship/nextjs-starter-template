/**
 * Finding where something was said, in the Transcript panel.
 *
 * The search is over the words the panel already holds, so it costs nothing
 * and needs no server. Capitals and punctuation are ignored, so "pricing"
 * finds "Pricing," and "pricing." alike. Several words are found only where
 * they were said one after another.
 */

export type SaidWord = { text: string; startMs: number; endMs: number }

export type SaidPlace = {
  /** The first word of the match, by its place in the list. */
  index: number
  /** How many words the match covers. */
  length: number
  startMs: number
  /** A few words either side, to tell one place from another. */
  before: string
  match: string
  after: string
}

/** Most places listed for one search, so a common word stays readable. */
export const SAID_PLACES_MAX = 200
const CONTEXT_WORDS = 4

function plain(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "")
}

/**
 * Every place the words typed were said, in order. Words left out by `skip`
 * (already cut from the film) are never matched, and a match never runs
 * across one.
 */
export function findSaidPlaces(
  words: readonly SaidWord[],
  query: string,
  skip: (index: number) => boolean = () => false
): SaidPlace[] {
  const wanted = query.split(/\s+/).map(plain).filter(Boolean)
  if (!wanted.length) return []
  const plainWords = words.map((word) => plain(word.text))
  const places: SaidPlace[] = []
  for (let index = 0; index + wanted.length <= words.length; index += 1) {
    let matches = true
    for (let offset = 0; offset < wanted.length; offset += 1) {
      const at = index + offset
      // The last word typed may be half written: "pric" finds "pricing".
      const word = plainWords[at]
      const want = wanted[offset]
      const last = offset === wanted.length - 1
      if (skip(at) || !(last ? word.startsWith(want) : word === want)) {
        matches = false
        break
      }
    }
    if (!matches) continue
    const end = index + wanted.length
    places.push({
      index,
      length: wanted.length,
      startMs: words[index].startMs,
      before: words
        .slice(Math.max(0, index - CONTEXT_WORDS), index)
        .map((word) => word.text)
        .join(" "),
      match: words
        .slice(index, end)
        .map((word) => word.text)
        .join(" "),
      after: words
        .slice(end, end + CONTEXT_WORDS)
        .map((word) => word.text)
        .join(" "),
    })
    if (places.length >= SAID_PLACES_MAX) break
  }
  return places
}
