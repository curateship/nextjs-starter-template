// Everything the app needs to draw a person: their uploaded picture when they
// have one, and a deterministic coloured initial when they do not. The seed is
// always the display name that sits next to the avatar, so the same person
// keeps the same colour on every surface without exposing account ids.

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
// The square we store. Big enough for the largest place we draw an avatar on a
// high-density screen, small enough that a profile picture is a few tens of KB.
export const AVATAR_PIXELS = 512
// How many colours the fallback picks from. Kept in step with the
// `.p-avatar[data-tone="…"]` rules in styles.css.
export const AVATAR_TONES = 8

export function avatarImageUrl(avatarMediaId: string) {
  return `/api/avatars/${avatarMediaId}/file`
}

// One or two letters, from the first and last word of the display name.
export function avatarInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return "?"
  const letters = words.length === 1 ? [firstLetter(words[0])] : [firstLetter(words[0]), firstLetter(words[words.length - 1])]
  const initials = letters.filter(Boolean).join("")
  return initials ? initials.toUpperCase() : "?"
}

export function avatarTone(seed: string) {
  let hash = 0
  for (const character of seed.trim().toLowerCase()) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 100_003
  return hash % AVATAR_TONES
}

// Names can start with an emoji or a letter built from several code units, so
// step by code point rather than by string index.
function firstLetter(word: string) {
  return [...word][0] ?? ""
}
