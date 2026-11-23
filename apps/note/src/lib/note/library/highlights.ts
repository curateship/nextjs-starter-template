
/**
 * Highlights are marks on a note's saved words: an X post's own, or a video's
 * transcript, which Analyse again reuses rather than writes afresh. Never on
 * the summary or the plan, so Analyse again leaves them where they are. Each
 * is a part (the post, the quoted post, one post of the thread, or one line
 * of the transcript) and a stretch of characters in it.
 */

/**
 * Which part a highlight is in, and where in its words: an X post's words,
 * its quoted post, one post of its thread, or one line of a video's
 * transcript (`line-<n>`, the nth line).
 */
export type HighlightPart = "post" | "quoted" | `thread-${number}` | `line-${number}`
export type Highlight = { part: HighlightPart; start: number; end: number }

const HIGHLIGHTS_MAX = 100

/** Adds one, joining it with any it overlaps or touches in the same part. */
export function addHighlight(list: readonly Highlight[], next: Highlight): Highlight[] {
  let merged = { ...next }
  const kept: Highlight[] = []
  for (const each of list) {
    if (each.part === merged.part && each.start <= merged.end && merged.start <= each.end) {
      merged = {
        part: merged.part,
        start: Math.min(each.start, merged.start),
        end: Math.max(each.end, merged.end),
      }
    } else {
      kept.push(each)
    }
  }
  return sortHighlights([...kept, merged]).slice(0, HIGHLIGHTS_MAX)
}

export function removeHighlight(list: readonly Highlight[], gone: Highlight): Highlight[] {
  return list.filter(
    (each) => !(each.part === gone.part && each.start === gone.start && each.end === gone.end)
  )
}

function sortHighlights(list: Highlight[]) {
  return list.sort((left, right) =>
    left.part === right.part ? left.start - right.start : left.part < right.part ? -1 : 1
  )
}

/**
 * Only highlights that fit the words they are on: a known part, a stretch
 * inside its words, and something in it. The server keeps nothing else.
 */
export function cleanHighlights(
  list: readonly Highlight[],
  partText: (part: HighlightPart) => string | null
): Highlight[] {
  const clean: Highlight[] = []
  for (const each of list) {
    const text = partText(each.part)
    if (text === null) continue
    const start = Math.max(0, Math.floor(each.start))
    const end = Math.min(text.length, Math.floor(each.end))
    if (end > start && text.slice(start, end).trim()) clean.push({ part: each.part, start, end })
  }
  return sortHighlights(clean).slice(0, HIGHLIGHTS_MAX)
}

export type TextPiece = { text: string; highlight: Highlight | null }

/** The words cut into plain and highlighted pieces, in order. */
export function highlightPieces(
  text: string,
  part: HighlightPart,
  list: readonly Highlight[]
): TextPiece[] {
  const mine = list.filter((each) => each.part === part).sort((left, right) => left.start - right.start)
  const pieces: TextPiece[] = []
  let at = 0
  for (const each of mine) {
    if (each.start < at || each.end > text.length) continue
    if (each.start > at) pieces.push({ text: text.slice(at, each.start), highlight: null })
    pieces.push({ text: text.slice(each.start, each.end), highlight: each })
    at = each.end
  }
  if (at < text.length) pieces.push({ text: text.slice(at), highlight: null })
  return pieces
}

export function isHighlightPart(value: string): value is HighlightPart {
  return value === "post" || value === "quoted" || /^thread-\d{1,3}$/.test(value) || /^line-\d{1,4}$/.test(value)
}
