/**
 * The coloured square a project is drawn with: its first letter, in one of
 * five tints picked from the name, so a project keeps its colour across
 * visits. The member's Projects card and the admin's Projects page pick the
 * same tint for the same name, each from its own palette.
 */
export const PROJECT_TONE_COUNT = 5

export function projectToneIndex(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return hash % PROJECT_TONE_COUNT
}

export function projectInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}
