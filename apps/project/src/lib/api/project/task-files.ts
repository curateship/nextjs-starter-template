import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { addTaskFile, deleteTaskFile } from "@/server/project/task-files"

const id = z.string().min(1).max(36)

/**
 * One file onto a task. Downloads go through
 * `src/routes/api/project/task-files.$fileId.ts`, which checks the person can
 * see the task.
 */
const addFileFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const file = data.get("file")
    const taskId = id.parse(data.get("taskId"))
    if (!(file instanceof File)) throw new Error("Pick a file to add.")
    return { taskId, file }
  })
  .handler(async ({ data, context }) => {
    // Refused before anything is stored or counted against the team.
    if (data.file.size > LIMITS.fileBytes) throw new Error(PROJECT_ERRORS.fileTooBig)
    try {
      await enforceRateLimit(`project-task-file:${context.user.id}`, {
        maxAttempts: 60,
        windowSeconds: 10 * 60,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes("RATE_LIMITED")) {
        throw new Error(PROJECT_ERRORS.tooManyUploads)
      }
      throw error
    }
    return addTaskFile(context.user, {
      taskId: data.taskId,
      name: data.file.name,
      mimeType: data.file.type,
      data: new Uint8Array(await data.file.arrayBuffer()),
    })
  })

const deleteFileFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ fileId: id }))
  .handler(async ({ data, context }) => deleteTaskFile(context.user, data.fileId))

export function addFileToTask(taskId: string, file: File) {
  const form = new FormData()
  form.append("taskId", taskId)
  form.append("file", file)
  return addFileFn({ data: form })
}

export function deleteFileFromTask(fileId: string) {
  return deleteFileFn({ data: { fileId } })
}
