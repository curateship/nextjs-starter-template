import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { editorGet, editorPost } from "@/server/video/editor-guards"
import { actorFor } from "@/server/video/project-guests"
import { storeProjectFile } from "@/server/video/project-uploads"

/**
 * The two calls only the guest editor makes (`workspace/docs/project-guests.md`):
 * who the guest is, and uploading a file straight into their project. The
 * shell's own upload puts a file in the signed-in person's library, and a
 * guest has neither a session nor a library.
 */

/** What the guest editor page is told about the guest. */
export type ProjectGuestView = { name: string; expires_at: string }

const GUEST_ENDED = "GUEST_ENDED"

export function getProjectGuestErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message === PROJECT_NOT_FOUND_MESSAGE || message.includes(GUEST_ENDED) || message.includes("AUTH_REQUIRED")) {
    return "Your time in this video has ended. Open the task in Project again."
  }
  return describeAuthError(message) ?? "That didn't work. Try again."
}

const loadGuestFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<ProjectGuestView> => {
    const { guest } = await actorFor(context.caller, data.projectId)
    // Somebody signed in to Video opens the project in the admin editor instead.
    if (!guest) throw new Error(GUEST_ENDED)
    return { name: guest.personName, expires_at: guest.expiresAt.toISOString() }
  })

const uploadFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const file = data.get("file")
    const projectId = data.get("project_id")
    if (!(file instanceof File)) throw new Error("File is required")
    if (typeof projectId !== "string" || !/^[A-Za-z0-9-]{1,36}$/.test(projectId)) {
      throw new Error(PROJECT_NOT_FOUND_MESSAGE)
    }
    return { file, projectId }
  })
  .handler(async ({ data, context }) => {
    const { userId } = await actorFor(context.caller, data.projectId)
    return storeProjectFile(userId, data.projectId, data.file)
  })

/** The guest behind this browser for the project, or a refusal once they have none. */
export function loadProjectGuest(projectId: string) {
  return loadGuestFn({ data: { projectId } })
}

/** Uploads a file into the project's media, for the guest editor. */
export function uploadProjectMedia(projectId: string, file: File) {
  const form = new FormData()
  form.set("file", file)
  form.set("project_id", projectId)
  return uploadFn({ data: form })
}
