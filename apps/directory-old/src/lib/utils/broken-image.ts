/**
 * True when a picture has finished loading with nothing to show.
 *
 * Public pages arrive already rendered from the server, so a broken picture
 * often gives up before React is running and no `onError` handler ever hears
 * about it. Asking the element this question on mount is the only way to catch
 * that one.
 */
export function isBrokenImage(image: { complete: boolean; naturalWidth: number }, src: string) {
  if (!image.complete || image.naturalWidth !== 0) return false
  // SVGs are left alone: some browsers report no natural size for one that
  // draws perfectly well, and a broken SVG is still caught by `onError`
  // whenever it fails after the page is running.
  return !src.toLowerCase().includes(".svg")
}
