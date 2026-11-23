import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { RENDER_NOT_FOUND_MESSAGE } from "@/lib/video/render"
import {
  isNamedChannelMessage,
  RETENTION_MESSAGES,
  YOUTUBE_LINK_MAX,
  type ExportRetention,
  type YoutubeConnectionStatus,
} from "@/lib/video/retention"
import { adminGet, adminPost } from "@/server/guards"
import { isAdmin } from "@/server/auth/security"
import { editorGet } from "@/server/video/editor-guards"
import {
  disconnectYoutube,
  getYoutubeConnectionStatus,
  removeYoutubeOauthClient,
  saveYoutubeOauthClient,
} from "@/server/video/youtube-oauth"
import {
  getExportRetention,
  postExportOnYoutube,
  refreshExportRetention,
  removeExportYoutube,
} from "@/server/video/youtube-retention"

/**
 * The YouTube channel the retention curves are read from, and each export's
 * curve (`workspace/docs/retention-curve.md`). Admin only: the channel is the
 * site's, connected once in Settings, so its figures are not every member's
 * to read.
 */

export type { ExportRetention, YoutubeConnectionStatus }

export function getRetentionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (RETENTION_MESSAGES.has(message) || isNamedChannelMessage(message)) {
    return message
  }
  if (message === RENDER_NOT_FOUND_MESSAGE) return message
  const said = message.indexOf("YouTube said:")
  if (said >= 0) return message.slice(said)
  if (message.includes("ENCRYPTION_NOT_CONFIGURED")) {
    return "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first."
  }
  return describeAuthError(message) ?? "That did not work. Try again in a moment."
}

const loadConnectionFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => getYoutubeConnectionStatus())

export function loadYoutubeConnection() {
  return loadConnectionFn()
}

const saveClientFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.union([
      z.object({ clientId: z.string().trim().min(1).max(200) }),
      z.object({ clientSecret: z.string().trim().min(1).max(200) }),
    ])
  )
  .handler(async ({ data }) => {
    await saveYoutubeOauthClient(data)
    return getYoutubeConnectionStatus()
  })

export function saveYoutubeClientId(clientId: string) {
  return saveClientFn({ data: { clientId } })
}

export function saveYoutubeClientSecret(clientSecret: string) {
  return saveClientFn({ data: { clientSecret } })
}

const removeClientFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    await removeYoutubeOauthClient()
    return getYoutubeConnectionStatus()
  })

export function removeYoutubeClient() {
  return removeClientFn()
}

const disconnectFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    const { revoked } = await disconnectYoutube()
    return { status: await getYoutubeConnectionStatus(), revoked }
  })

export function disconnectYoutubeChannel() {
  return disconnectFn()
}

const exportIdSchema = z.object({ exportId: z.string().min(1).max(36) })

/**
 * Null for anybody but a signed-in admin, so the Export window leaves the
 * card out rather than offering a channel that is not theirs. The window also
 * opens in the editor for a guest sent from Project, who gets null too.
 */
const loadRetentionFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(exportIdSchema)
  .handler(async ({ data, context }) => {
    const { user } = context.caller
    return user && isAdmin(user) && context.caller.guests.length === 0
      ? getExportRetention(user.id, data.exportId)
      : null
  })

export function loadExportRetention(exportId: string) {
  return loadRetentionFn({ data: { exportId } })
}

const postFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    exportIdSchema.extend({ link: z.string().max(YOUTUBE_LINK_MAX) })
  )
  .handler(async ({ data, context }) =>
    postExportOnYoutube({
      userId: context.user.id,
      exportId: data.exportId,
      pasted: data.link,
    })
  )

export function postExportYoutubeLink(exportId: string, link: string) {
  return postFn({ data: { exportId, link } })
}

const refreshFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(exportIdSchema)
  .handler(async ({ data, context }) =>
    refreshExportRetention({ userId: context.user.id, exportId: data.exportId })
  )

export function refreshExportYoutube(exportId: string) {
  return refreshFn({ data: { exportId } })
}

const removeLinkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(exportIdSchema)
  .handler(async ({ data, context }) =>
    removeExportYoutube(context.user.id, data.exportId)
  )

export function removeExportYoutubeLink(exportId: string) {
  return removeLinkFn({ data: { exportId } })
}
