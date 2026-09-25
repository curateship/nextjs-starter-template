// The room chat reaction palette. Deliberately tiny — a quiet acknowledgement,
// not a full emoji picker — so rooms stay calm. Shared by the server (schema
// validation, snapshot ordering) and the client (picker, chips) so the allowed
// set lives in exactly one place. This module must stay free of server imports
// so it is safe to bundle into the client.
export const ROOM_REACTION_EMOJIS = ["👍", "💪", "🔥", "❤️", "😄"] as const

export type RoomReactionEmoji = (typeof ROOM_REACTION_EMOJIS)[number]

// Plain-word names used for accessible labels, since screen readers should not
// have to announce raw emoji glyphs.
export const ROOM_REACTION_LABELS: Record<RoomReactionEmoji, string> = {
  "👍": "thumbs up",
  "💪": "muscle",
  "🔥": "fire",
  "❤️": "heart",
  "😄": "smile",
}

export function isRoomReactionEmoji(value: string): value is RoomReactionEmoji {
  return (ROOM_REACTION_EMOJIS as readonly string[]).includes(value)
}

export function roomReactionLabel(emoji: string): string {
  return isRoomReactionEmoji(emoji) ? ROOM_REACTION_LABELS[emoji] : emoji
}

// Stable position of an emoji in the palette, used to keep reaction chips in a
// fixed order instead of letting them reshuffle as counts change.
export function roomReactionOrder(emoji: string): number {
  const index = (ROOM_REACTION_EMOJIS as readonly string[]).indexOf(emoji)
  return index === -1 ? ROOM_REACTION_EMOJIS.length : index
}
