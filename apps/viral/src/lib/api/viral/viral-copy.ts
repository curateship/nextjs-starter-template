import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminPost } from "@/server/guards"
import { copyVideoToProject, type VideoCopyResult } from "@/server/viral/copy-to-project"

/**
 * Copy to another project for one video on the right panel
 * (`workspace/docs/vault.md`). Admin only; the owner comes from the session,
 * and the server checks the project is theirs.
 */

export type { VideoCopyResult }

const copyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ url: z.string().min(1).max(2048), projectId: z.string().min(1).max(36) }))
  .handler(
    async ({ data, context }): Promise<VideoCopyResult> =>
      copyVideoToProject(context.user.id, { url: data.url, targetProjectId: data.projectId })
  )

export function copyVideoToProjectFn(url: string, projectId: string) {
  return copyFn({ data: { url, projectId } })
}
