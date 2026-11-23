/**
 * The streak badge's picture, and the words on it.
 *
 * Pure and free of server imports, so the escaping below can be tested
 * without a database and the settings panel can describe a badge without
 * fetching one.
 *
 * The badge carries two facts and nothing else: the streak number and the
 * public display name, if there is one. No email, no id, no session count,
 * no task titles. Anyone with the address sees exactly what the person chose
 * to publish.
 */

/** How long a served badge may be reused, by browsers and by any cache between. */
export const STREAK_BADGE_MAX_AGE_SECONDS = 300

/** What `randomBytes(32).toString("base64url")` can produce, and no more. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Whether a value is shaped like a badge address at all.
 *
 * The route asks this before the database does anything, so junk is turned
 * away for free. It is not decoration: Postgres refuses a string carrying a
 * NUL byte outright, so without this `/badge/streak/%00.svg` throws and
 * answers 500 to anyone who asks for it.
 */
export function isBadgeTokenShape(value: string) {
  return TOKEN_SHAPE.test(value)
}

export const STREAK_BADGE_WIDTH = 220
export const STREAK_BADGE_HEIGHT = 56

export type StreakBadgeFacts = {
  /** The public display name, or null to show the app's name alone. */
  displayName: string | null
  currentStreak: number
}

/**
 * XML-escapes a value on its way into the picture.
 *
 * This is the one thing in the file that must not be got wrong. A display
 * name is typed by a person and the badge is served from the app's own
 * address, so an unescaped `<` would let someone put markup, and with it a
 * script, on a page served by us. Every one of the five XML characters is
 * escaped, including both quote forms, because the same helper is used for
 * text and could later be used for an attribute.
 */
export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** "23-day focus streak", and the singular for one. */
export function streakLine(currentStreak: number) {
  return `${currentStreak}-day focus streak`
}

/**
 * Trims a display name to what fits the badge, so a 50-character name cannot
 * push the picture out of shape. The cut happens before escaping, so the
 * limit counts characters a person typed rather than entities.
 */
export function badgeName(displayName: string | null) {
  const trimmed = (displayName ?? "").trim()
  if (!trimmed) return null
  return trimmed.length > 22 ? `${trimmed.slice(0, 21)}…` : trimmed
}

/**
 * The badge as an SVG document.
 *
 * Deliberately one self-contained file with no external font, image or
 * stylesheet: it is embedded on other people's pages, where a request of ours
 * to a third party would be both slow and a thing those readers did not ask
 * for. The typeface is whatever the reader already has.
 */
export function renderStreakBadgeSvg(facts: StreakBadgeFacts) {
  const name = badgeName(facts.displayName)
  const line = streakLine(Math.max(0, Math.trunc(facts.currentStreak)))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STREAK_BADGE_WIDTH}" height="${STREAK_BADGE_HEIGHT}" viewBox="0 0 ${STREAK_BADGE_WIDTH} ${STREAK_BADGE_HEIGHT}" role="img" aria-label="${escapeXml(
    name ? `${name}: ${line} on pomodoro` : `${line} on pomodoro`
  )}">
<rect width="${STREAK_BADGE_WIDTH}" height="${STREAK_BADGE_HEIGHT}" rx="12" fill="#14131A"/>
<rect x="0.5" y="0.5" width="${STREAK_BADGE_WIDTH - 1}" height="${STREAK_BADGE_HEIGHT - 1}" rx="11.5" fill="none" stroke="#FFFFFF" stroke-opacity="0.12"/>
<circle cx="28" cy="28" r="11" fill="#FF5A3C"/>
<path d="M28 22.5v6l4 2.2" stroke="#14131A" stroke-width="2.2" stroke-linecap="round" fill="none"/>
<text x="48" y="25" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="700" fill="#F4F1EC">${escapeXml(
    line
  )}</text>
<text x="48" y="41" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" fill="#F4F1EC" fill-opacity="0.55">${escapeXml(
    name ? `${name} · pomodoro` : "pomodoro"
  )}</text>
</svg>
`
}
