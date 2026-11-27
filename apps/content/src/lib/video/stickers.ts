import { z } from "zod"

/**
 * The Text panel's stickers: one list per person, emoji and pictures mixed.
 *
 * Somebody who has never changed the list sees the eight below, and nothing is
 * stored for them. The first add or remove saves the whole list, the eight
 * included, so removing one of the eight sticks the same way removing an added
 * one does.
 *
 * An emoji sticker lands as an ordinary text clip. A picture sticker lands as
 * an ordinary picture clip at `STICKER_PICTURE_SCALE` of the frame (see
 * clip-size.ts), so both can be moved, resized and deleted like anything else.
 */

export type StickerEntry =
  | { kind: "emoji"; emoji: string }
  | { kind: "image"; mediaId: string }

/** A picture sticker as the panel draws it: the entry plus its file. */
export type Sticker =
  | { kind: "emoji"; emoji: string }
  | { kind: "image"; mediaId: string; url: string; name: string }

export const BUILT_IN_STICKERS: StickerEntry[] = [
  "🔥",
  "✨",
  "👀",
  "☕",
  "💯",
  "➡️",
  "❤️",
  "⭐",
].map((emoji) => ({ kind: "emoji", emoji }))

/** Far more than fits on screen without scrolling, and a ceiling on the row. */
export const MAX_STICKERS = 60

// The size every emoji sticker has always arrived at, and where: the middle of
// the frame. A text clip's size is in the 1080-tall design space.
export const EMOJI_STICKER_FONT_SIZE = 90

export const STICKER_NOT_EMOJI_MESSAGE = "Type one emoji to add it as a sticker."
export const STICKER_DUPLICATE_MESSAGE = "That sticker is already in your list."
export const STICKER_LIST_FULL_MESSAGE = `You can keep up to ${MAX_STICKERS} stickers. Remove one to add another.`
export const STICKER_PICTURE_NOT_FOUND_MESSAGE =
  "That picture is no longer in your library."

// One recommended emoji, including the ones built from several code points:
// flags, skin tones, keycaps and families joined with zero-width joiners. Built
// at runtime because the `v` flag is newer than the compile target, not the
// runtime: Node 20+ and every current browser read it.
const SINGLE_EMOJI = new RegExp("^\\p{RGI_Emoji}$", "v")

/**
 * The emoji typed into the field, or null when it is not exactly one.
 *
 * A bare heart or arrow typed without the colour selector is still an emoji
 * people mean, so it is tried again with U+FE0F added, and saved in that form
 * so "❤" and "❤️" are not two different stickers.
 */
export function readEmoji(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 32) return null
  if (SINGLE_EMOJI.test(trimmed)) return trimmed
  const presented = `${trimmed}️`
  return SINGLE_EMOJI.test(presented) ? presented : null
}

export function sameSticker(a: StickerEntry, b: StickerEntry) {
  return a.kind === "emoji"
    ? b.kind === "emoji" && a.emoji === b.emoji
    : b.kind === "image" && a.mediaId === b.mediaId
}

export const stickerEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("emoji"), emoji: z.string().min(1).max(32) }),
  z.object({ kind: z.literal("image"), mediaId: z.string().min(1).max(36) }),
])

/**
 * A stored list, read defensively. An entry that no longer reads (a value
 * written by hand, an emoji the check now refuses) is dropped rather than
 * failing the whole list, and so is a repeat.
 */
export function readStickerList(value: unknown): StickerEntry[] {
  if (!Array.isArray(value)) return []
  const list: StickerEntry[] = []
  for (const raw of value) {
    const parsed = stickerEntrySchema.safeParse(raw)
    if (!parsed.success) continue
    const entry: StickerEntry =
      parsed.data.kind === "emoji"
        ? { kind: "emoji", emoji: readEmoji(parsed.data.emoji) ?? "" }
        : parsed.data
    if (entry.kind === "emoji" && !entry.emoji) continue
    if (list.some((kept) => sameSticker(kept, entry))) continue
    list.push(entry)
    if (list.length === MAX_STICKERS) break
  }
  return list
}
