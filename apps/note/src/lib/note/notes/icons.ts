/**
 * The icons a note or a folder can wear: a picture from the app's own icon
 * set, saved as `icon:<name>`, or an emoji, saved as `emoji:<emoji>`. Only
 * these lists are accepted, so a stored icon is always one of them. The
 * pictures themselves are in `components/note-notes/note-icon.tsx`, which
 * keeps the icon library out of the server.
 */

export const NOTE_ICON_NAMES = [
  "book",
  "bookmark",
  "brain",
  "briefcase",
  "calendar",
  "camera",
  "code",
  "coffee",
  "dollar",
  "file",
  "flag",
  "folder",
  "globe",
  "school",
  "heart",
  "home",
  "idea",
  "checklist",
  "place",
  "music",
  "travel",
  "rocket",
  "star",
  "people",
] as const
export type NoteIconName = (typeof NOTE_ICON_NAMES)[number]

export const NOTE_EMOJIS = [
  "📝", "📚", "📖", "💡", "✅", "📌", "⭐", "🔥", "🎯", "🚀",
  "💼", "💰", "📈", "🧠", "❤️", "🏠", "✈️", "🍳", "🎵", "🎬",
  "🏃", "🌱", "🛠️", "🎉", "🤝", "📅", "🔒", "❓", "⚠️", "🧪",
] as const

export const ICON_PREFIX = "icon:"
export const EMOJI_PREFIX = "emoji:"

/** A stored icon, or null when it is not one of the offered ones. */
export function cleanIcon(icon: string | null | undefined): string | null {
  if (!icon) return null
  if (icon.startsWith(ICON_PREFIX)) {
    return (NOTE_ICON_NAMES as readonly string[]).includes(icon.slice(ICON_PREFIX.length)) ? icon : null
  }
  if (icon.startsWith(EMOJI_PREFIX)) {
    return (NOTE_EMOJIS as readonly string[]).includes(icon.slice(EMOJI_PREFIX.length)) ? icon : null
  }
  return null
}
