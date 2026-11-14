import { fullPictureLayer, newTextLayer, withTextLook, type ThumbnailShape } from "@/lib/video/thumbnails"
import { getPublicMediaUrl } from "@/server/media/storage"
import type { CustomShellDb } from "@/server/db"
import { db } from "@/server/db"
import { createThumbnail } from "@/server/video/thumbnails"

/**
 * Puts an AI thumbnail step's picture and words on a video's Thumbnail board,
 * as an idea does (`makeIdea` in `thumbnail-ai.ts`): the picture filling the
 * board, the words over it in the accent look. Called when the step is made
 * on a run already saved, or when the run is saved after it.
 */
export async function placeFlowThumbnail(
  owner: string,
  videoId: string,
  shape: ThumbnailShape,
  picture: { mediaId: string; storagePath: string; name: string },
  words: string,
  database: CustomShellDb = db
) {
  const base = fullPictureLayer({ mediaId: picture.mediaId, url: await getPublicMediaUrl(picture.storagePath), name: picture.name })
  const text = withTextLook(newTextLayer(shape, [base], words), "accent")
  const thumbnail = await createThumbnail({ owner, videoId, shape, layers: [base, text], database })
  return thumbnail.id
}
