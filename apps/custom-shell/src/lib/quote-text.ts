/**
 * Somebody else's words, put inside a sentence the app is writing — the line of
 * feedback a confirmation is about to delete, for instance.
 *
 * Two jobs. The quotes mark it as quoted, so a message reading "are you sure?"
 * cannot be mistaken for the app asking. And the trim keeps a long message from
 * stretching the window it is being shown in: newlines are flattened, because a
 * three-line message would otherwise make a confirmation three lines taller.
 */

/** Long enough to recognise which one it is, short enough to stay on one line. */
const MAX_QUOTED_LENGTH = 80

export function quoteOneLine(text: string, max = MAX_QUOTED_LENGTH) {
  const oneLine = text.replace(/\s+/g, " ").trim()
  if (oneLine.length <= max) return `"${oneLine}"`
  return `"${oneLine.slice(0, max).trimEnd()}…"`
}
