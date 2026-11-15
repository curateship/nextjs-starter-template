import { SKY_COVER } from "@/lib/notes/page-cover"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { isOwnedImageUrl } from "@/server/media/library"
import { db } from "@/server/db"

/**
 * A project's or a team's cover, as its page's Cover photo row saves it: the
 * picked one ("" for none, `SKY_COVER`, or a picture) and the pictures kept
 * as tiles. Every picture that is new to the page must be one the site admin
 * uploaded to the media library, as the banner and team photo always had to
 * be, so nobody can point a page at an outside address. A picture the page
 * already had stays allowed.
 */
export async function checkCoverPictures(
  userId: string,
  next: { url: string | undefined; images: string[] | undefined },
  stored: { url: string | null; images: string[] },
  database: Pick<typeof db, "select"> = db
) {
  const had = new Set([...(stored.url ? [stored.url] : []), ...stored.images])
  const pictures = [...(next.url && next.url !== SKY_COVER ? [next.url] : []), ...(next.images ?? [])]
  for (const url of new Set(pictures)) {
    if (had.has(url)) continue
    if (!(await isOwnedImageUrl(userId, url, database))) throw new Error(PROJECT_ERRORS.photoNotYours)
  }
}
