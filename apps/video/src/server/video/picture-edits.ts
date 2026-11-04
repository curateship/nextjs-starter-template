import { and, eq } from "drizzle-orm"
import sharp from "sharp"

import { nearestImageAspect, type ImageModelId } from "@/lib/video/asset-factories"
import {
  PICTURE_EDIT_FAILED_MESSAGE,
  PICTURE_EDIT_NOT_FOUND_MESSAGE,
  PICTURE_EDIT_WORDS_MESSAGE,
  pictureEditCostCents,
  pictureEditPrompt,
  WORDED_EDITS,
  type PictureEditKind,
} from "@/lib/video/picture-edits"
import { db } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { generateImage } from "@/server/video/asset-factories/images"
import {
  discardGeneratedAsset,
  saveGeneratedAsset,
} from "@/server/video/asset-factories/media"
import {
  pictureSize,
  readStoredPicture,
} from "@/server/video/asset-factories/person-board"
import { attachMediaToScope } from "@/server/video/media-list"
import {
  requireVideoBudget,
  videoSpendMetadata,
} from "@/server/video/project-spend"
import type { VideoProjectVideoRow } from "@/server/video/schema"

/**
 * Changing a picture with AI (picture-clean-up.md, thumbnails.md). The changed
 * picture is a new file in the media library and on the video's project
 * shelf, like every picture the AI makes, and the old one is never touched,
 * so Undo on the timeline and the before and after slider both have it.
 */

export type EditedPicture = {
  media_id: string
  url: string
  name: string
  mime_type: string
  width: number
  height: number
}

/** How green a pixel is past its red and blue, for keying a cut-out. */
function greenness(red: number, green: number, blue: number) {
  return green - Math.max(red, blue)
}

/**
 * A person on a flat green background with the green taken out: a PNG whose
 * background is see-through. Pixels clearly green go fully clear, pixels a
 * little green go partly clear, and the green cast on the person's edge is
 * taken back down, so hair does not come out with a green rim.
 */
export async function keyOutGreen(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
  for (let at = 0; at < pixels.length; at += 4) {
    const red = pixels[at]
    const green = pixels[at + 1]
    const blue = pixels[at + 2]
    const excess = greenness(red, green, blue)
    if (excess > 90) {
      pixels[at + 3] = 0
    } else if (excess > 30) {
      pixels[at + 3] = Math.round(255 * (1 - (excess - 30) / 60))
      pixels[at + 1] = Math.max(red, blue)
    } else if (excess > 0) {
      pixels[at + 1] = Math.max(red, blue) + Math.round(excess / 2)
    }
  }
  return new Uint8Array(
    await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer()
  )
}

/**
 * One AI change to a picture, kept in the library and on the video's
 * project shelf. The caller has already held the call to the video's spend
 * limit; `owner` is whose library it lands in and whose key pays.
 */
export async function editPicture({
  owner,
  video,
  source,
  kind,
  words = "",
  model,
  name,
}: {
  owner: string
  video: Pick<VideoProjectVideoRow, "id" | "projectId">
  source: { bytes: Uint8Array; mimeType: string }
  kind: PictureEditKind
  words?: string
  model: ImageModelId
  name: string
}): Promise<EditedPicture> {
  if (WORDED_EDITS.has(kind) && !words.trim()) throw new Error(PICTURE_EDIT_WORDS_MESSAGE)
  const size = await pictureSize(source.bytes).catch(() => {
    throw new Error(PICTURE_EDIT_FAILED_MESSAGE)
  })
  const image = await generateImage({
    userId: owner,
    model,
    prompt: pictureEditPrompt(kind, words),
    aspectRatio: nearestImageAspect(size.width, size.height),
    references: [source],
    spend: videoSpendMetadata(video),
  })
  const bytes = kind === "cutout" ? await keyOutGreen(image.bytes) : image.bytes
  const mimeType = kind === "cutout" ? "image/png" : image.mimeType
  const made = await pictureSize(bytes)
  const media = await saveGeneratedAsset({
    userId: owner,
    bytes,
    mimeType,
    fileType: "image",
    name,
  })
  try {
    await attachMediaToScope(owner, { type: "project", id: video.projectId }, media.id)
  } catch (error) {
    await discardGeneratedAsset(media)
    throw error
  }
  return {
    media_id: media.id,
    url: media.url,
    name: media.originalName.replace(/\.[a-z]+$/, ""),
    mime_type: mimeType,
    width: made.width,
    height: made.height,
  }
}

/** A picture in this person's own library, as bytes, or the refusal. */
export async function readOwnedPicture(userId: string, mediaId: string) {
  const [media] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      mimeType: customShellMedia.mimeType,
      originalName: customShellMedia.originalName,
    })
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.id, mediaId),
        eq(customShellMedia.userId, userId),
        eq(customShellMedia.fileType, "image")
      )
    )
    .limit(1)
  if (!media) throw new Error(PICTURE_EDIT_NOT_FOUND_MESSAGE)
  const bytes = await readStoredPicture(media.storagePath).catch(() => {
    throw new Error(PICTURE_EDIT_NOT_FOUND_MESSAGE)
  })
  return {
    bytes,
    mimeType: media.mimeType,
    name: media.originalName.replace(/\.[a-z0-9]+$/i, ""),
  }
}

/** The new picture's name, from the old one and what was done to it. */
function editedName(original: string, kind: PictureEditKind, words = "") {
  const base = original.slice(0, 80)
  if (kind === "reflection") return `${base} without reflection`
  if (kind === "object") return `${base} without ${words.trim().slice(0, 40)}`
  if (kind === "cutout") return `${base} cut out`
  return `${base} ${kind}`
}

/**
 * A picture clip on the timeline with a reflection or an object taken off
 * (picture-clean-up.md). The editor swaps the new picture into the clip's
 * place itself, as one undo step.
 */
export async function cleanUpOwnedPicture({
  userId,
  videoId,
  mediaId,
  kind,
  words,
  model,
}: {
  userId: string
  videoId: string
  mediaId: string
  kind: "reflection" | "object"
  words?: string
  model: ImageModelId
}) {
  const video = await requireVideoBudget(userId, videoId, pictureEditCostCents(model))
  const picture = await readOwnedPicture(userId, mediaId)
  return editPicture({
    owner: userId,
    video,
    source: picture,
    kind,
    words,
    model,
    name: editedName(picture.name, kind, words),
  })
}
