import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  SHARE_EXPIRY_VALUES,
  SHARE_ONLY_READY_MESSAGE,
  shareExpiryDays,
  type ExportShareSummary,
  type ShareExpiryChoice,
} from "@/lib/video/export-shares"
import { RENDER_NOT_FOUND_MESSAGE } from "@/lib/video/render"
import { userGet, userPost } from "@/server/guards"
import {
  createOwnedExportShare,
  getOwnedExportShare,
  readSharedExportView,
  revokeOwnedExportShare,
} from "@/server/video/export-shares"

/**
 * Share links. Making, reading and turning off a link is the owner's, carried
 * from the session like every other export endpoint. Reading what a link opens
 * is the one door in this app with no session behind it; its reason is written
 * in `src/app/open-endpoints.ts`.
 */

export type { ExportShareSummary }

const KNOWN_MESSAGES = new Set([
  RENDER_NOT_FOUND_MESSAGE,
  SHARE_ONLY_READY_MESSAGE,
])

export function getExportShareErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "The share link could not be changed."
}

const exportIdSchema = z.object({ exportId: z.string().min(1).max(36) })

const loadExportShareFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(exportIdSchema)
  .handler(async ({ data, context }) => {
    return getOwnedExportShare(context.user.id, data.exportId)
  })

const createExportShareFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    exportIdSchema.extend({ expiry: z.enum(SHARE_EXPIRY_VALUES) })
  )
  .handler(async ({ data, context }) => {
    return createOwnedExportShare({
      userId: context.user.id,
      exportId: data.exportId,
      expiresInDays: shareExpiryDays(data.expiry),
    })
  })

const revokeExportShareFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(exportIdSchema)
  .handler(async ({ data, context }) => {
    await revokeOwnedExportShare(context.user.id, data.exportId)
  })

const readSharedExportFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token: z.string().max(128) }))
  .handler(async ({ data }) => {
    return readSharedExportView(data.token)
  })

export function loadExportShare(exportId: string) {
  return loadExportShareFn({ data: { exportId } })
}

export function createExportShare(exportId: string, expiry: ShareExpiryChoice) {
  return createExportShareFn({ data: { exportId, expiry } })
}

export function revokeExportShare(exportId: string) {
  return revokeExportShareFn({ data: { exportId } })
}

export function readSharedExport(token: string) {
  return readSharedExportFn({ data: { token } })
}
