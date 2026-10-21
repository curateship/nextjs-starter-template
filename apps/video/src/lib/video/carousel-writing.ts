/**
 * What the carousel's writing tools say and the bounds they keep, shared by
 * the server and the editor (workspace/docs/carousel-writing.md).
 */

export const CAROUSEL_SLIDE_COUNT = { min: 3, max: 20, start: 7 } as const

export const CAROUSEL_SOURCE_KINDS = ["topic", "notes", "project", "link"] as const
export type CarouselSourceKind = (typeof CAROUSEL_SOURCE_KINDS)[number]

export const CAROUSEL_SOURCE_EMPTY_MESSAGE =
  "Give the writer something to work from first."
export const PROJECT_SCRIPT_EMPTY_MESSAGE =
  "That project has no script yet: no voiceover and no words on its timeline."
export const CAROUSEL_NO_WORDS_MESSAGE =
  "This carousel has no words yet for the writer to work from."
export const FIRST_SLIDE_NO_TEXT_MESSAGE =
  "Pick a text layer with words on the first slide."
export const LINK_REFUSED_MESSAGE =
  "That address cannot be read. Use a public https web page."
export const LINK_UNREADABLE_MESSAGE =
  "That page could not be read. Check the address, or paste its words in instead."

// Labels the writer puts at the front of its own failures, which the browser
// shows as they are.
export const CAROUSEL_WRITER_LABELS = [
  "Carousel writer",
  "First slide",
  "Carousel caption",
  "Carousel translation",
] as const
