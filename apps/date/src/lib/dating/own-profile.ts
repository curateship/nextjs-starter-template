/** One of the AI's suggestions the phone can apply: the photo order, the bio, or one prompt's answer. */
export type ProfileSuggestion = { kind: "photos" } | { kind: "bio" } | { kind: "prompt"; question: string }

/**
 * The name one change to the member's own profile is known by, on the server
 * (`appliedAt`, the walk making it) and on the My profile panel: "photos",
 * "bio", or "prompt:" and the prompt's question.
 */
export function changeKey(change: ProfileSuggestion): string {
  return change.kind === "prompt" ? `prompt:${change.question}` : change.kind
}

/** Whether two bits of a profile say the same, whatever the spaces and line breaks. */
export function sameWords(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim()
}

/** Whether two lists of photos hold the same photos, in any order. */
export function samePhotos(a: string[], b: string[]): boolean {
  const set = new Set(b)
  return a.length === b.length && a.every((id) => set.has(id))
}
