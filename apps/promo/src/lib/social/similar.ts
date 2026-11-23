/**
 * Whether two comments say nearly the same thing, worked out in the browser
 * as the box is typed in. Its own file, because the comment box needs it at
 * runtime and a value imported out of `@/server/*` drags the database into
 * the browser's bundle.
 */

/**
 * Whether the words in the box are nearly the same as one already sent:
 * most of the box's words, in a long enough comment, are in the other. Said
 * so a person does not post the same comment word for word twice.
 */
export function nearlyTheSame(text: string, other: string): boolean {
  const words = (value: string) => value.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean)
  const mine = words(text)
  if (mine.length < 8) return false
  const theirs = new Set(words(other))
  const shared = mine.filter((word) => theirs.has(word)).length
  return shared / mine.length >= 0.8
}
