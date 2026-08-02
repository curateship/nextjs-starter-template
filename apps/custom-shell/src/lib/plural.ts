/** "1 thing", "3 things" — the one place an s gets added. */
export function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`
}
