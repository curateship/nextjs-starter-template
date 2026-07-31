import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  ANNOUNCEMENT_LEVELS,
  DEFAULT_ANNOUNCEMENT_LEVEL,
  MAX_ANNOUNCEMENT_BODY_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  type AnnouncementLevel,
} from "@/lib/announcement"

export type Announcement = {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  showBanner: boolean
  notify: boolean
  startsAt: string
  endsAt: string | null
}

const announcementErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
  ANNOUNCEMENT_NOT_FOUND: "That announcement no longer exists.",
  ANNOUNCEMENT_TITLE_REQUIRED: "Give the announcement a title.",
  ANNOUNCEMENT_BODY_REQUIRED: "Write what you want to tell everyone.",
  ANNOUNCEMENT_CHANNEL_REQUIRED:
    "Pick at least one place to show it — the banner or the notification tray.",
  ANNOUNCEMENT_WINDOW_INVALID: "The end date has to be after the start date.",
}

export function getAnnouncementErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(announcementErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? announcementErrorMessages[matched]
    : "We could not load the announcements. Please try again."
}

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
  showBanner: z.boolean().default(true),
  notify: z.boolean().default(false),
  startsOn: dateFieldSchema.default(""),
  endsOn: dateFieldSchema.default(""),
})

export type AnnouncementFormInput = z.input<typeof announcementInputSchema>

const idListSchema = z.object({
  announcementIds: z.array(z.string().min(1).max(36)).min(1).max(200),
})

const listAdminFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ announcements: Announcement[] }> => {
    const { requireAdmin } = await import("@/server/security")
    const { listAnnouncements, serializeAnnouncement } = await import(
      "@/server/announcements"
    )

    await requireAdmin()
    const announcements = await listAnnouncements()
    return { announcements: announcements.map(serializeAnnouncement) }
  }
)

const createFn = createServerFn({ method: "POST" })
  .inputValidator(announcementInputSchema)
  .handler(async ({ data }): Promise<Announcement> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { createAnnouncement, serializeAnnouncement } = await import(
      "@/server/announcements"
    )

    requireAppOrigin()
    await requireAdmin()
    return serializeAnnouncement(await createAnnouncement(data))
  })

const updateFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      announcementId: z.string().min(1).max(36),
      announcement: announcementInputSchema,
    })
  )
  .handler(async ({ data }): Promise<Announcement> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { updateAnnouncement, serializeAnnouncement } = await import(
      "@/server/announcements"
    )

    requireAppOrigin()
    await requireAdmin()
    return serializeAnnouncement(
      await updateAnnouncement(data.announcementId, data.announcement)
    )
  })

const retireFn = createServerFn({ method: "POST" })
  .inputValidator(idListSchema)
  .handler(async ({ data }): Promise<{ count: number }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { retireAnnouncements } = await import("@/server/announcements")

    requireAppOrigin()
    await requireAdmin()
    return retireAnnouncements(data.announcementIds)
  })

const deleteFn = createServerFn({ method: "POST" })
  .inputValidator(idListSchema)
  .handler(async ({ data }): Promise<{ count: number }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { deleteAnnouncements } = await import("@/server/announcements")

    requireAppOrigin()
    await requireAdmin()
    return deleteAnnouncements(data.announcementIds)
  })

/** Anyone signed in can hide a banner — for themselves and nobody else. */
const dismissFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ announcementId: z.string().min(1).max(36) }))
  .handler(async ({ data }): Promise<{ announcementId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireUser } = await import("@/server/security")
    const { dismissAnnouncement } = await import("@/server/announcements")

    requireAppOrigin()
    const user = await requireUser()
    return dismissAnnouncement(user.id, data.announcementId)
  })

export function loadAdminAnnouncements() {
  return listAdminFn()
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
