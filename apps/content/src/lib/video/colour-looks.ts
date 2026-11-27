import type { FilmLookId } from "@/lib/video/film-looks"

/**
 * A person's own saved colour look (workspace/docs/colour-looks.md): a film
 * look or none, and the three colour sliders, under a name.
 */
export type SavedColourLook = {
  id: string
  name: string
  look: FilmLookId | null
  brightness: number
  contrast: number
  saturation: number
}

export const COLOUR_LOOK_NAME_MAX = 60
/** Enough for every kind of shot somebody films, without a list to scroll. */
export const MAX_COLOUR_LOOKS = 50

export const COLOUR_LOOK_NAME_MESSAGE = "Give the look a name"
export const COLOUR_LOOKS_FULL_MESSAGE = `You can keep ${MAX_COLOUR_LOOKS} looks. Delete one to save another.`
