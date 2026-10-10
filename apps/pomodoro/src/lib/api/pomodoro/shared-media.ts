import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { userPost } from "@/server/guards"
import {
  listSharedMedia,
  loadSharedFilePage,
  setSharedMediaSaved as saveSharedMedia,
  sharedOwnerForHandle,
} from "@/server/pomodoro/shared-media"
import { readFeaturedSharedFile } from "@/server/pomodoro/admin-shared-media"
import {
  reportCopyright,
  reportSharedFile as reportSharedFileRow,
} from "@/server/pomodoro/shared-media-reports"
import { HANDLE_MAX_LENGTH } from "@/lib/pomodoro/public-profile"
import {
  SHARE_MESSAGES,
  type SharedMediaPage,
} from "@/lib/pomodoro/shared-media"
import {
  COPYRIGHT_EMAIL_MAX,
  COPYRIGHT_NAME_MAX,
  COPYRIGHT_URL_MAX,
  COPYRIGHT_WORK_MAX,
  SHARED_FILE_REPORT_REASON_IDS,
  type SharedFileReportReasonId,
} from "@/lib/pomodoro/shared-media-reports"

/**
 * Shared sounds and backgrounds. See `workspace/docs/shared-media.md`.
 *
 * The two reads are open on purpose and written down in
 * `src/app/open-endpoints.ts`: shared files show on public profiles and on
 * their own public pages, which strangers with no account read. Each read
 * looks for a session only to apply the reader's blocks and hearts.
 */

export const getSharedMediaErrorMessage = createErrorMessage(
  { ...SHARE_MESSAGES },
  "That did not work. Please try again."
)

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(HANDLE_MAX_LENGTH)

const listSchema = z.object({
  purpose: z.enum(["background", "sound"]),
  scope: z.enum(["everyone", "saved"]),
  search: z.string().max(80),
  tag: z.string().max(40).nullable(),
  sort: z.enum(["newest", "most_used"]),
  page: z.number().int().min(0).max(500),
  /** One person's files, for "Show all" on their public page. */
  handle: handleSchema.nullable(),
})

export type SharedMediaQuery = z.infer<typeof listSchema>

// Open: "Shared by members" lists files their owners chose to show the
// public, and a profile's "Show all" is the same list one owner at a time.
const listSharedFn = createServerFn({ method: "GET" })
  .inputValidator(listSchema)
  .handler(async ({ data }): Promise<SharedMediaPage> => {
    const viewer = await findCurrentUser()
    const viewerUserId = viewer?.id ?? null
    let ownerUserId: string | undefined
    if (data.handle) {
      const owner = await sharedOwnerForHandle(data.handle, viewerUserId)
      if (!owner) return { items: [], total: 0, tags: [] }
      ownerUserId = owner
    }
    return listSharedMedia({ viewerUserId, ...data, ownerUserId })
  })

export const listSharedMediaPage = (data: SharedMediaQuery) =>
  listSharedFn({ data })

// Open: `/u/<handle>/files/<id>` is a public page anybody may follow a link
// to. It answers null for every kind of missing, so nothing can be learned.
const readSharedFileFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ handle: handleSchema, mediaId: z.string().uuid() })
  )
  .handler(async ({ data }) => {
    const viewer = await findCurrentUser()
    return loadSharedFilePage(data.handle, data.mediaId, viewer?.id ?? null)
  })

export const readSharedFile = (handle: string, mediaId: string) =>
  readSharedFileFn({ data: { handle, mediaId } })

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ mediaId: z.string().uuid(), saved: z.boolean() }))
  .handler(async ({ data, context }) =>
    saveSharedMedia(context.user.id, data.mediaId, data.saved)
  )

/** The heart: keep a shared file for later, or let it go. */
export const setSharedMediaSaved = (mediaId: string, saved: boolean) =>
  saveFn({ data: { mediaId, saved } })

// Open, like the profile's Report: shared cards sit on public pages, most of
// whose readers have no account. It makes the origin check the guard would
// have made, and answers the same way whatever happens.
const reportSharedFileFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      mediaId: z.string().uuid(),
      reason: z.enum(SHARED_FILE_REPORT_REASON_IDS),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    const viewer = await findCurrentUser()
    await reportSharedFileRow({ ...data, reporterUserId: viewer?.id ?? null })
    return { filed: true }
  })

export const reportSharedFile = (
  mediaId: string,
  reason: SharedFileReportReasonId
) => reportSharedFileFn({ data: { mediaId, reason } })

// Open: a record label will not make an account to ask for a file to come
// down. Limited by address, origin-checked, and it only ever writes a row
// into the admins' queue.
const copyrightFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().trim().min(1).max(COPYRIGHT_NAME_MAX),
      email: z.string().trim().email().max(COPYRIGHT_EMAIL_MAX),
      address: z.string().trim().min(1).max(COPYRIGHT_URL_MAX),
      work: z.string().trim().min(1).max(COPYRIGHT_WORK_MAX),
      statement: z.literal(true),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    await reportCopyright(data)
    return { filed: true }
  })

export const sendCopyrightReport = (data: {
  name: string
  email: string
  address: string
  work: string
  statement: true
}) => copyrightFn({ data })

// Open: the featured file sits on the signed-out front page. It is the one
// file an admin chose to show the public, its owner's handle only while
// their page is public, and it is held for a minute rather than read per
// visit.
const readFeaturedFn = createServerFn({ method: "GET" }).handler(() =>
  readFeaturedSharedFile()
)

export const readFeaturedSharedMedia = () => readFeaturedFn()
