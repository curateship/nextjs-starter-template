import sharp from "sharp"

import { db, type CustomShellDb } from "@/server/db"
import { findOwnedImageByUrl } from "@/server/media/library"
import { getFromR2 } from "@/server/media/storage"

/** The round picture is drawn at most this big, so it is shrunk once to this. */
const PICTURE_SIDE = 256

/**
 * The round pictures on social stickers (social-stickers.ts), read for the
 * export. A sticker stores its picture as the address the browser shows, so
 * each one is turned back into the owner's own file before it is read: an
 * address that is not one of the owner's pictures, or a file since deleted,
 * is left out, and that sticker draws the name's first letter instead.
 *
 * Each picture comes back as a small PNG written into a `data:` address,
 * which is what the export's SVG drawing can read.
 */
export async function loadSocialPictures(
  userId: string,
  urls: string[],
  database: Pick<CustomShellDb, "select"> = db
) {
  const pictures = new Map<string, string>()
  for (const url of new Set(urls)) {
    const row = await findOwnedImageByUrl(userId, url, database).catch(() => null)
    if (!row) continue
    try {
      const object = await getFromR2(row.storagePath)
      const bytes = await object.Body?.transformToByteArray()
      if (!bytes) continue
      const png = await sharp(bytes)
        .resize(PICTURE_SIDE, PICTURE_SIDE, { fit: "cover" })
        .png()
        .toBuffer()
      pictures.set(url, `data:image/png;base64,${png.toString("base64")}`)
    } catch (error) {
      // The sticker still draws, with the first letter in place of the picture.
      console.error("A sticker's picture could not be read", row.storagePath, error)
    }
  }
  return pictures
}
