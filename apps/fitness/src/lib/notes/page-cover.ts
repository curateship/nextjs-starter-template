import { z } from "zod"

/**
 * What a page's cover can be (Tyler, 8 Nov 2026: "in project app we have the
 * morning, afternoon and night automated scene? add that but only use the sky
 * one. I also want to add custom images too"):
 *
 * - **None** (null), what a page starts with.
 * - **Sky** (`SKY_COVER`), Project's drawn sky following the viewer's clock
 *   (`cover-sky.tsx`), without Project's scenes or weather.
 * - **A picture**: an address from the media library, one of the page's own
 *   `coverImages`, which stay as tiles to pick again, up to `MAX_COVER_IMAGES`.
 *
 * The rules are shared by every page with a cover, the CRM's and Admin's.
 */

export const SKY_COVER = "sky"

export const MAX_COVER_IMAGES = 8

/** A picture's address: https, or a path on this site. Never `//…`, which a browser reads as another site. */
const pictureSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => /^\/(?!\/)/.test(value) || /^https:\/\//.test(value))

/** The cover picked: none, the sky, or a picture. */
export const coverSchema = z.union([z.literal(SKY_COVER), pictureSchema]).nullable()

/** The page's own pictures, kept as tiles. */
export const coverImagesSchema = z.array(pictureSchema).max(MAX_COVER_IMAGES)

/** The stored list read back: anything that is not a list of pictures reads as none. */
export function readCoverImages(value: unknown): string[] {
  const parsed = coverImagesSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

/** When each part of the day starts, as Project's starting hours: 5 AM, 12 PM, 6 PM. */
const MORNING = 5 * 60
const AFTERNOON = 12 * 60
const NIGHT = 18 * 60

export type SkyPhase = "sunrise" | "day" | "golden" | "sunset" | "night"

/**
 * The sky for a moment on the viewer's clock, as Project's `skyPhase` with
 * its starting hours: a sunrise for the first hour of the morning, gold for
 * the last 90 minutes of the afternoon, a sunset for the first hour of the
 * night, and stars after that until morning.
 */
export function skyPhaseAt(at: Date): SkyPhase {
  const minutes = at.getHours() * 60 + at.getMinutes()
  if (minutes >= MORNING && minutes < AFTERNOON) return minutes - MORNING < 60 ? "sunrise" : "day"
  if (minutes >= AFTERNOON && minutes < NIGHT) return NIGHT - minutes <= 90 ? "golden" : "day"
  const sinceNight = minutes - NIGHT
  return sinceNight >= 0 && sinceNight < 60 ? "sunset" : "night"
}
