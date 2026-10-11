/**
 * The coloured square a project is drawn with: its first letter, in one of
 * five tints picked from the name, so a project keeps its colour across
 * visits. The member's Projects card and the admin's Projects page pick the
 * same tint for the same name, each from its own palette.
 */
export const PROJECT_TONE_COUNT = 5

/**
 * Pomoder's small tints: a pale wash with text dark enough to read on the
 * cream light mode and light enough for the near-black dark mode. Project
 * squares, the task row's project pill and the public profile's badge marks
 * draw from these, so none falls back to dark-mode text in both modes.
 *
 * `accent` reads the member screens' orange token, which the admin pages do
 * not have.
 */
export const TINTS = {
  sky: "bg-sky-400/15 text-sky-700 dark:text-sky-300",
  // One shade darker than the others in light mode: amber-700 on its own
  // wash measured 4.4:1, under the 4.5 a letter this size needs.
  amber: "bg-amber-400/15 text-amber-800 dark:text-amber-300",
  emerald: "bg-emerald-400/15 text-emerald-700 dark:text-emerald-300",
  violet: "bg-violet-400/15 text-violet-700 dark:text-violet-300",
  // The orange itself is too pale for a letter on cream (2.8:1), so light
  // mode writes it in a deep orange and dark mode keeps the accent.
  accent: "bg-[color:var(--p-accent)]/15 text-orange-800 dark:text-[var(--p-accent)]",
} as const

/** A project's five tints on member screens, in `projectToneIndex` order. */
export const PROJECT_TONES = [TINTS.sky, TINTS.amber, TINTS.emerald, TINTS.violet, TINTS.accent]

/** The same five on the admin pages, with a plain orange for the accent. */
export const ADMIN_PROJECT_TONES = [
  TINTS.sky,
  TINTS.amber,
  TINTS.emerald,
  TINTS.violet,
  "bg-orange-400/15 text-orange-800 dark:text-orange-300",
]

export function projectToneIndex(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return hash % PROJECT_TONE_COUNT
}

export function projectInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}
