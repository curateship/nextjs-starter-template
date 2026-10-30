import { z } from "zod"

import {
  ASSET_ASPECT_RATIOS,
  MAX_SHEET_PICTURES,
  VIDEO_QUALITY_IDS,
} from "@/lib/video/asset-factories"
import { BOARD_TILES, EXTRA_KINDS } from "@/lib/video/extras"
import { VOICE_TEXT_MAX, voiceSettingsSchema } from "@/lib/video/voice"

/**
 * What a clip the AI made remembers about how it was made, so Make it again
 * can make it once more in the same place (`workspace/docs/regenerate-a-scene.md`).
 *
 * The server writes it, beside the file it hands back, and the editor copies
 * it onto the clip it lays down. A clip without one was uploaded, came from
 * stock, or was laid down before this existed, and cannot be made again.
 */

const idSchema = z.string().min(1).max(36)

const sentExtraSchema = z
  .object({
    kind: z.enum(EXTRA_KINDS),
    extra_id: idSchema,
    media_id: idSchema,
  })
  .strict()

/** A first frame from the AI clip panel, laid down as a picture. */
const pictureOriginSchema = z
  .object({
    tool: z.literal("first-frame"),
    model: z.string().min(1).max(100),
    /** The direction, such as "Mia holding a coffee in a bright kitchen". */
    prompt: z.string().max(5000),
    /** The actor's pictures it was drawn from. Empty means the main picture. */
    referenceMediaIds: z.array(idSchema).max(MAX_SHEET_PICTURES),
    actorId: idSchema,
    extras: z.array(sentExtraSchema).max(EXTRA_KINDS.length),
    aspectRatio: z.enum(ASSET_ASPECT_RATIOS),
  })
  .strict()

/**
 * A scene's picture from Brief to video (`workspace/docs/brief-to-video.md`):
 * the picture direction and the model, with the project's look and no actor.
 */
const scenePictureOriginSchema = z
  .object({
    tool: z.literal("brief"),
    model: z.string().min(1).max(100),
    /** The scene's picture direction, such as "Bread on a board in low light". */
    prompt: z.string().max(5000),
    aspectRatio: z.enum(ASSET_ASPECT_RATIOS),
  })
  .strict()

/**
 * One piece of a moving shot: from the AI clip panel ("shot"), or a picture
 * on the timeline made to move ("animate").
 */
const movingOriginSchema = z
  .object({
    tool: z.enum(["shot", "animate"]),
    model: z.string().min(1).max(100),
    /** What moves in this piece. */
    prompt: z.string().max(5000),
    /** The picture the piece started on. */
    firstFrameMediaId: idSchema,
    /** The person board's pictures and the backdrop, in the order sent. */
    referenceMediaIds: z.array(idSchema).max(BOARD_TILES + 1),
    actorId: idSchema.optional(),
    extras: z.array(sentExtraSchema).max(EXTRA_KINDS.length),
    aspectRatio: z.enum(ASSET_ASPECT_RATIOS),
    quality: z.enum(VIDEO_QUALITY_IDS),
    /** Whether the company made sound. Left out on shots that always have it. */
    sound: z.boolean().optional(),
  })
  .strict()

/** A voice line from Voice, Hook, Another language or a brief's scene. */
const voiceOriginSchema = z
  .object({
    tool: z.enum(["voice", "hook", "translate", "brief-voice"]),
    model: z.string().min(1).max(100),
    /** The script as it was written, directions such as [whispering] included. */
    prompt: z.string().max(VOICE_TEXT_MAX),
    voice: z
      .object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(255),
        speaker: z.enum(["elevenlabs", "openai"]),
      })
      .strict(),
    settings: voiceSettingsSchema.optional(),
  })
  .strict()

export const clipOriginSchema = z.discriminatedUnion("tool", [
  pictureOriginSchema,
  scenePictureOriginSchema,
  movingOriginSchema,
  voiceOriginSchema,
])

export type ClipOrigin = z.infer<typeof clipOriginSchema>
export type FirstFrameOrigin = z.infer<typeof pictureOriginSchema>
export type ScenePictureOrigin = z.infer<typeof scenePictureOriginSchema>
/** A picture the AI made: a first frame, or a brief's scene. */
export type PictureOrigin = FirstFrameOrigin | ScenePictureOrigin
export type MovingOrigin = z.infer<typeof movingOriginSchema>
export type VoiceOrigin = z.infer<typeof voiceOriginSchema>

export function isPictureOrigin(origin: ClipOrigin): origin is PictureOrigin {
  return origin.tool === "first-frame" || origin.tool === "brief"
}

export function isMovingOrigin(origin: ClipOrigin): origin is MovingOrigin {
  return origin.tool === "shot" || origin.tool === "animate"
}

export function isVoiceOrigin(origin: ClipOrigin): origin is VoiceOrigin {
  return (
    origin.tool === "voice" ||
    origin.tool === "hook" ||
    origin.tool === "translate" ||
    origin.tool === "brief-voice"
  )
}
