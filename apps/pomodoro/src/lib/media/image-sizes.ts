/**
 * The widths a public image is offered in, and the addresses those copies live
 * at. Shared by the browser, which writes the `srcset`, and the server, which
 * cuts the copies.
 *
 * Three widths, not a ladder of ten. Every extra width is another file in the
 * bucket for every picture ever uploaded, and the browser only ever downloads
 * one of them.
 */
export const MEDIA_IMAGE_WIDTHS = [400, 800, 1600] as const

const UUID_PATH_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const RESIZED_MEDIA_STORAGE_PATH = new RegExp(
  `^${UUID_PATH_SEGMENT}/sizes/(?:${MEDIA_IMAGE_WIDTHS.join("|")})/.+$`,
  "i"
)

/**
 * Formats a smaller copy would come out wrong in, so they are never cut.
 *
 * SVG is already one file that draws at any size, and rasterising it would make
 * it worse. An animated GIF loses its animation unless every frame is resized,
 * which costs far more than the bytes it saves.
 */
const UNRESIZABLE_EXTENSIONS = new Set(["svg", "gif"])

/** The address of a `width`-wide copy, which is cut on first request. */
export function resizedMediaStoragePath(storagePath: string, width: number) {
  const owner = storagePath.split("/")[0]
  const filename = storagePath.split("/").slice(1).join("/")
  return `${owner}/sizes/${width}/${filename}`
}

/**
 * True only for a copy this module cut. The orphan tool and the delete sweep
 * both need to tell a generated copy from a real upload, the same way
 * `isGeneratedFaviconStoragePath` does for browser-tab icons.
 */
export function isResizedMediaStoragePath(storagePath: string) {
  return RESIZED_MEDIA_STORAGE_PATH.test(storagePath)
}

/** Whether smaller copies of this address are worth asking for. */
export function canResizeMediaUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false
  const path = url.split(/[?#]/)[0]
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase()
  return !UNRESIZABLE_EXTENSIONS.has(extension)
}

/**
 * The app's own address for a `width`-wide copy of a stored picture.
 *
 * The width comes last on purpose. With `src` last the whole address ends in
 * `.webp` or `.jpg`, and anything between the browser and this app that decides
 * what a request is by looking at the end of it — the dev server's own static
 * file handler, for one — answers it instead of letting it through.
 */
function resizedMediaUrl(url: string, width: number) {
  return `/api/v1/media/resized?src=${encodeURIComponent(url)}&w=${width}`
}

/**
 * The `srcset` for one stored picture, or nothing when it has no smaller copies
 * worth offering.
 *
 * The original is the last candidate rather than a fourth generated width, so a
 * desktop screen big enough to want it still gets the file that was uploaded.
 * `width` on the original is a claim about the widest copy, which is all the
 * browser needs to rank the candidates.
 */
export function mediaImageSrcSet(url: string) {
  if (!canResizeMediaUrl(url)) return undefined
  const copies = MEDIA_IMAGE_WIDTHS.map(
    (width) => `${resizedMediaUrl(url, width)} ${width}w`
  )
  return [...copies, `${url} 2400w`].join(", ")
}
