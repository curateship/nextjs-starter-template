import { aiUnitCostCents } from "@/lib/ai/ai-models"
import type { GeminiImageModelId, ImageModelId } from "@/lib/video/asset-factories"

/**
 * Changing a picture with AI rather than making one from words: a glass
 * reflection taken off, an object taken out, a frame made brighter or
 * sharper, a person cut out (picture-clean-up.md, thumbnails.md).
 *
 * The picture goes to the picture model with one fixed request per kind. Every
 * request ends the same way, asking for nothing else to change, because the
 * models happily "improve" a face or add a logo when not told otherwise.
 */

export const PICTURE_EDIT_KINDS = [
  "reflection",
  "object",
  "brighter",
  "cleaner",
  "cutout",
  "background",
  "own",
  "sharpen",
] as const
export type PictureEditKind = (typeof PICTURE_EDIT_KINDS)[number]

/** The kinds that need words typed with them. */
export const WORDED_EDITS = new Set<PictureEditKind>(["object", "background", "own"])

export const PICTURE_EDIT_WORDS_MAX = 300

/** What each kind is called on a button. */
export const PICTURE_EDIT_LABELS: Record<PictureEditKind, string> = {
  reflection: "Remove reflection",
  object: "Remove an object",
  brighter: "Brighter",
  cleaner: "Cleaner",
  cutout: "Cut me out",
  background: "New background",
  own: "My own words",
  sharpen: "Sharpen",
}

/** Nano Banana 2, unless the dropdown says otherwise (Tyler, 3 Nov 2026). */
export const PICTURE_EDIT_MODEL: GeminiImageModelId = "gemini-3.1-flash-image"

export const PICTURE_EDIT_NOT_FOUND_MESSAGE = "That picture is no longer in your library."
export const PICTURE_EDIT_WORDS_MESSAGE = "Say what should change first."
export const PICTURE_EDIT_FAILED_MESSAGE = "The picture could not be changed this time"

const KEEP_THE_REST =
  " Keep everything else exactly as it is: the same people and faces, the same framing and size, the same colours and text. Add nothing that was not there."

/**
 * The words sent with the picture. `words` is what was typed, for the kinds
 * that take it.
 */
export function pictureEditPrompt(kind: PictureEditKind, words = "") {
  const typed = words.trim().slice(0, PICTURE_EDIT_WORDS_MAX)
  switch (kind) {
    case "reflection":
      return `This photo was taken through a glass window. Remove the reflections on the glass: the mirrored room, lamps, windows, people and glare that show on top of the view. Show the view behind the glass clean and clear.${KEEP_THE_REST}`
    case "object":
      return `Remove ${typed} from this photo, and fill the space it leaves with what would naturally be behind it.${KEEP_THE_REST}`
    case "brighter":
      return `Make this photo brighter and better lit, as if it had been taken in good light: faces clear, shadows lifted, nothing washed out.${KEEP_THE_REST}`
    case "cleaner":
      return `Clean up this photo: take out the grain and the blur, make the detail crisp and the colours true.${KEEP_THE_REST}`
    case "cutout":
      return "Cut the main person out of this photo and put them on a plain, flat, pure green background (#00FF00) with nothing else on it, no shadow and no floor. Keep the person exactly as they are: the same face, hair, clothes, pose and size in the frame."
    case "background":
      return `Keep the main person exactly as they are, with the same face, hair, clothes, pose and size in the frame, and replace everything behind them with ${typed}.`
    case "own":
      return `${typed}${KEEP_THE_REST}`
    case "sharpen":
      return `Make this exact picture sharp and detailed at full size, as if it had been taken with a better camera.${KEEP_THE_REST}`
  }
}

/** What one change costs: one picture from the model picked. */
export function pictureEditCostCents(model: ImageModelId, tries = 1) {
  return aiUnitCostCents(model, tries)
}
