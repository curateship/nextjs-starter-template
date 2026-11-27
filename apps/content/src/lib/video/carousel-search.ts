/**
 * The carousel editor's address names the carousel it has open,
 * `?carousel=<id>`. Without it the carousel project opens on the carousel
 * this person last had open, or its first.
 */
export type CarouselSearch = { carousel?: string }

export function readCarouselSearch(search: Record<string, unknown>): CarouselSearch {
  const carousel = search.carousel
  return typeof carousel === "string" && /^[A-Za-z0-9-]{1,36}$/.test(carousel) ? { carousel } : {}
}
