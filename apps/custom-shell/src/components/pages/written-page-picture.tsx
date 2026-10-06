import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { publicContentAlignmentGridClassName } from "@/components/shell/public-content-alignment"
import { cn } from "@/lib/utils"

/**
 * The picture a page an admin added carries, drawn at the top of the page
 * above everything on it.
 *
 * **It belongs to the page, not to a block.** It is chosen in the Add a page
 * window and in the editor's Page settings panel, beside the page's name and
 * address, which is where Tyler asked for it on 6 Oct 2026. A page with no
 * picture draws nothing here at all, which is every page written before the
 * field existed.
 *
 * **Square, and the size every other picture field in the app shows**, so what
 * the square preview in those two panels shows is what the page draws. 384px
 * is `max-w-sm`: a picture of the page rather than a banner across it. It
 * follows the site's content alignment, the same way the blocks under it do.
 */
export function WrittenPagePicture({
  image,
  alt,
  title,
}: {
  image: string
  alt: string
  /** The page's name, read out when the library had no name for the file. */
  title: string
}) {
  if (!image) return null

  return (
    <div
      // The space under the picture is in theme.css, beside the blocks' own,
      // so the picture and the first block sit as far apart as any two blocks
      // and flat mode collapses both together.
      data-page-picture=""
      className={cn("grid w-full", publicContentAlignmentGridClassName)}
    >
      <MediaThumbnail
        url={image}
        fileType="image"
        alt={alt || title}
        fit="cover"
        className="aspect-square w-full max-w-sm overflow-hidden rounded-lg"
        // 384px once there is room for it, and the window on a phone, where
        // the picture is capped by the page's own edges instead.
        sizes="(min-width: 640px) 384px, 100vw"
        // The top of the page is what a visitor sees before scrolling, so this
        // one loads with the page rather than waiting to be reached.
        eager
      />
    </div>
  )
}
