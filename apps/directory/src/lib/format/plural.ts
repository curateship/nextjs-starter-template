/** "thing", "things" — the one place count-based wording is chosen. */
export function plural(count: number, one: string, many = `${one}s`) {
  return count === 1 ? one : many
}
