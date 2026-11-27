import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  LINK_IMPORT_NONE,
  LINK_IMPORT_NOT_FOUND,
  LINK_IMPORT_TOO_MANY,
} from "@/lib/video/link-imports"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { COLLECTION_NOT_FOUND_MESSAGE } from "@/lib/video/media-collections"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { editorGet, editorPost } from "@/server/video/editor-guards"
import {
  listLinkImports,
  removeLinkImport,
  retryLinkImport,
  startLinkImports,
} from "@/server/video/link-imports"
import { signedInActor } from "@/server/video/project-guests"

/**
 * Import from a link, from the editor's Media panel
 * (`workspace/docs/import-from-a-link.md`). The owner's alone: a guest sent
 * from Project has no media library of the owner's to fill, and
 * `signedInActor` refuses one.
 */

const PASTE_RATE_LIMIT = { maxAttempts: 30, windowSeconds: 10 * 60 }

const KNOWN_MESSAGES = new Set([
  LINK_IMPORT_NONE,
  LINK_IMPORT_TOO_MANY,
  PROJECT_NOT_FOUND_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
])

export function getLinkImportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  if (message.includes(LINK_IMPORT_NOT_FOUND)) {
    return "That import has already finished or gone."
  }
  if (message.includes("RATE_LIMITED")) {
    return "That's a lot of links at once. Wait a few minutes and try again."
  }
  return describeAuthError(message) ?? "The links could not be imported."
}

const startFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1).max(36),
      // 20 links of up to 2,000 characters each, with their line breaks.
      text: z.string().max(42_000),
      collectionId: z.string().min(1).max(36).nullable(),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = signedInActor(context.caller)
    await enforceRateLimit(`link-import:${userId}`, PASTE_RATE_LIMIT)
    return startLinkImports(userId, data.projectId, data.text, data.collectionId)
  })

const listFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(({ data, context }) =>
    listLinkImports(signedInActor(context.caller).userId, data.projectId)
  )

const retryFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(({ data, context }) =>
    retryLinkImport(signedInActor(context.caller).userId, data.id)
  )

const removeFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(({ data, context }) =>
    removeLinkImport(signedInActor(context.caller).userId, data.id)
  )

/** Starts a download for each good line of a paste, into this project. */
export function startLinkImport(
  projectId: string,
  text: string,
  collectionId: string | null
) {
  return startFn({ data: { projectId, text, collectionId } })
}

/** This project's imports still downloading, waiting, or failed. */
export function listProjectLinkImports(projectId: string) {
  return listFn({ data: { projectId } })
}

export function retryProjectLinkImport(id: string) {
  return retryFn({ data: { id } })
}

export function removeProjectLinkImport(id: string) {
  return removeFn({ data: { id } })
}
