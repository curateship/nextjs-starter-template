import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  BIO_MAX_LENGTH,
  HANDLE_MAX_LENGTH,
  MAX_PINNED_BADGES,
} from "@/lib/pomodoro/public-profile"
import {
  MAX_PUBLIC_SOCIAL_LINKS,
  MAX_PUBLIC_SOCIAL_URL_LENGTH,
  PUBLIC_SOCIAL_PLATFORMS,
} from "@/lib/pages/public-social"
import { userGet, userPost } from "@/server/guards"
import {
  loadMyPublicProfile as loadMyPublicProfileRow,
  readPublicProfile as readPublicProfileRow,
  readYearInReview as readYearInReviewRow,
  saveMyPublicProfile as saveMyPublicProfileRow,
} from "@/server/pomodoro/public-profile"

/**
 * The public profile's endpoints.
 *
 * Two of the three carry a guard, because they are somebody's own settings.
 * The third is open on purpose: `/u/<handle>` is a page for the open
 * internet, so the door has to be one anybody may knock on. It is written
 * down in `src/app/open-endpoints.ts` with the reason, which is what
 * `src/server/guards.test.ts` checks.
 */

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(HANDLE_MAX_LENGTH)

const socialLinkSchema = z.object({
  platform: z.enum(PUBLIC_SOCIAL_PLATFORMS),
  url: z.string().max(MAX_PUBLIC_SOCIAL_URL_LENGTH),
})

const publicProfileSchema = z.object({
  handle: handleSchema.nullable(),
  profilePublic: z.boolean(),
  bio: z.string().max(BIO_MAX_LENGTH).nullable(),
  socialLinks: z.array(socialLinkSchema).max(MAX_PUBLIC_SOCIAL_LINKS),
  bannerRef: z.string().max(80).nullable(),
  pinnedBadges: z.array(z.string().max(40)).max(MAX_PINNED_BADGES),
  showFigures: z.boolean(),
  showBadges: z.boolean(),
  showHeatmap: z.boolean(),
  showProjects: z.boolean(),
  showFocusingNow: z.boolean(),
  showRoom: z.boolean(),
})

export type PublicProfileForm = z.infer<typeof publicProfileSchema>

// Signed-out on purpose: this is what draws a public profile page. It answers
// with one person's chosen name and whichever sections they switched on, and
// null for a handle nobody holds — the same null a switched-off profile and a
// deleted account give, so nothing can be learned from the difference. No
// user id is in the answer. Listed in appOpenEndpoints for the guard test.
const readPublicProfileFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ handle: handleSchema }))
  .handler(async ({ data }) => readPublicProfileRow(data.handle))

// Open for the same reason and under the same rules as the profile read
// above: it is the year recap at /u/<handle>/<year>, which is the whole point
// of the page being shareable.
const readYearInReviewFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ handle: handleSchema, year: z.number().int().max(9999) })
  )
  .handler(async ({ data }) => readYearInReviewRow(data.handle, data.year))

// The browser's timezone is the fallback for creating the profile row, the
// same argument `loadPomodoroProfile` takes and for the same reason: it is
// the only moment the app can learn it.
const loadMyPublicProfileFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ timezone: z.string().min(1).max(60) }))
  .handler(async ({ data, context }) =>
    loadMyPublicProfileRow(context.user.id, data.timezone)
  )

const saveMyPublicProfileFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(publicProfileSchema)
  .handler(async ({ data, context }) =>
    saveMyPublicProfileRow(context.user.id, data)
  )

export const readPublicProfile = (handle: string) =>
  readPublicProfileFn({ data: { handle } })
export const readYearInReview = (handle: string, year: number) =>
  readYearInReviewFn({ data: { handle, year } })
export const loadMyPublicProfile = (timezone: string) =>
  loadMyPublicProfileFn({ data: { timezone } })
export const saveMyPublicProfile = (data: PublicProfileForm) =>
  saveMyPublicProfileFn({ data })
