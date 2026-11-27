import { createServerFn } from "@tanstack/react-start"
import { listAnnouncements, serializeAnnouncement, createAnnouncement, updateAnnouncement, retireAnnouncements, deleteAnnouncements, dismissAnnouncement, loadUserAnnouncements, loadVisitorAnnouncements as loadVisitorAnnouncementsQuery } from "@/server/content/announcements"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import { publishToEveryone } from "@/server/notifications/events"
import { findWorkspaceIdForRequest, visitorWorkspaceId, workspaceIdForRequest } from "@/server/workspaces/for-request"
import { createErrorMessage } from "../error-message"
import { z } from "zod"

import {
  ANNOUNCEMENT_LEVELS,
  ANNOUNCEMENT_AUDIENCES,
  DEFAULT_ANNOUNCEMENT_LEVEL,
  MAX_ANNOUNCEMENT_BODY_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  type AnnouncementLevel,
  type AnnouncementAudience,
  type UserAnnouncement,
  type VisitorAnnouncement,
} from "@/lib/announcement"

export type Announcement = {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  showBanner: boolean
  notify: boolean
  startsAt: string
  endsAt: string | null
}

export const getAnnouncementErrorMessage = createErrorMessage(
  {
    ANNOUNCEMENT_NOT_FOUND: "That announcement no longer exists.",
    ANNOUNCEMENT_TITLE_REQUIRED: "Give the announcement a title.",
    ANNOUNCEMENT_BODY_REQUIRED: "Write what you want to tell everyone.",
    ANNOUNCEMENT_CHANNEL_REQUIRED:
      "Pick at least one place to show it — the banner or the notification tray.",
    ANNOUNCEMENT_WINDOW_INVALID: "The end date has to be after the start date.",
  },
  "We could not load the announcements. Please try again."
)

/** Empty means "no date picked"; anything else has to be a real yyyy-mm-dd. */
const dateFieldSchema = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "ANNOUNCEMENT_WINDOW_INVALID")

const announcementInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "ANNOUNCEMENT_TITLE_REQUIRED")
    .max(MAX_ANNOUNCEMENT_TITLE_LENGTH),
  body: z
    .string()
    .trim()
    .min(1, "ANNOUNCEMENT_BODY_REQUIRED")
    .max(MAX_ANNOUNCEMENT_BODY_LENGTH),
  level: z.enum(ANNOUNCEMENT_LEVELS).default(DEFAULT_ANNOUNCEMENT_LEVEL),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default("app"),
  showBanner: z.boolean().default(true),
  notify: z.boolean().default(false),
  startsOn: dateFieldSchema.default(""),
  endsOn: dateFieldSchema.default(""),
})

export type AnnouncementFormInput = z.input<typeof announcementInputSchema>

const idListSchema = z.object({
  announcementIds: z.array(z.string().min(1).max(36)).min(1).max(200),
})

/**
 * Public on purpose. The request's domain chooses the site, and the query only
 * returns live announcements an admin explicitly opened to visitors.
 */
const readVisitorAnnouncementsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<VisitorAnnouncement[]> => {
    const workspaceId = await visitorWorkspaceId()
    return workspaceId ? loadVisitorAnnouncementsQuery(workspaceId) : []
  }
)

const listAdminFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ announcements: Announcement[] }> => {
    const announcements = await listAnnouncements(
      await workspaceIdForRequest(context.user.id)
    )
    return { announcements: announcements.map(serializeAnnouncement) }
  })

const createFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(announcementInputSchema)
  .handler(async ({ data, context }): Promise<Announcement> => {
    const created = serializeAnnouncement(
      await createAnnouncement(await workspaceIdForRequest(context.user.id), data)
    )
    // Every open tab shows it now, rather than on its next page load.
    await publishToEveryone()
    return created
  })

const updateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      announcementId: z.string().min(1).max(36),
      announcement: announcementInputSchema,
    })
  )
  .handler(async ({ data, context }): Promise<Announcement> => {
    const updated = serializeAnnouncement(
      await updateAnnouncement(
        await workspaceIdForRequest(context.user.id),
        data.announcementId,
        data.announcement
      )
    )
    await publishToEveryone()
    return updated
  })

const retireFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(idListSchema)
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const result = await retireAnnouncements(
      await workspaceIdForRequest(context.user.id),
      data.announcementIds
    )
    await publishToEveryone()
    return result
  })

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(idListSchema)
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const result = await deleteAnnouncements(
      await workspaceIdForRequest(context.user.id),
      data.announcementIds
    )
    await publishToEveryone()
    return result
  })

/** Anyone signed in can hide a banner — for themselves and nobody else. */
const dismissFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ announcementId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<{ announcementId: string }> => {
    return dismissAnnouncement(
      await workspaceIdForRequest(context.user.id),
      context.user.id,
      data.announcementId
    )
  })

/**
 * The banners this person should see now, asked again by an open tab when the
 * bell's live connection nudges it, so a new announcement shows without a
 * page load. As on page load, it also writes any tray notice they are owed.
 */
const readMyAnnouncementsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<UserAnnouncement[]> => {
    const workspaceId = await findWorkspaceIdForRequest(context.user.id)
    if (!workspaceId) return []
    return (await loadUserAnnouncements(workspaceId, context.user.id)).banners
  })

export function loadMyAnnouncements() {
  return readMyAnnouncementsFn()
}

export function loadAdminAnnouncements() {
  return listAdminFn()
}

export function loadVisitorAnnouncements() {
  return readVisitorAnnouncementsFn()
}

export function createAdminAnnouncement(announcement: AnnouncementFormInput) {
  return createFn({ data: announcement })
}

export function updateAdminAnnouncement(
  announcementId: string,
  announcement: AnnouncementFormInput
) {
  return updateFn({ data: { announcementId, announcement } })
}

export function retireAdminAnnouncements(announcementIds: string[]) {
  return retireFn({ data: { announcementIds } })
}

export function deleteAdminAnnouncements(announcementIds: string[]) {
  return deleteFn({ data: { announcementIds } })
}

export function dismissAnnouncementBanner(announcementId: string) {
  return dismissFn({ data: { announcementId } })
}
