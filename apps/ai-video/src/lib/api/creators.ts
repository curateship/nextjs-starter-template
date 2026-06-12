import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { CreatorItem, CreatorListResponse } from "@/server/creators"

export type { CreatorItem, CreatorListResponse }

const creatorIdSchema = z.object({
  creatorId: z.string().min(1).max(36),
})

const creatorSafeErrorMessages = new Set(["Creator not found"])

export function getCreatorErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Creator request failed."
  if (creatorSafeErrorMessages.has(error.message)) return error.message
  return "Creator request failed."
}

const listCreatorsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CreatorListResponse> => {
    const { listCreatorsForCurrentUser } = await import("@/server/creators")
    return listCreatorsForCurrentUser()
  }
)

const getCreatorFn = createServerFn({ method: "GET" })
  .inputValidator(creatorIdSchema)
  .handler(async ({ data }): Promise<CreatorItem> => {
    const { getCreatorForCurrentUser } = await import("@/server/creators")
    return getCreatorForCurrentUser(data.creatorId)
  })

const bulkDeleteCreatorsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ creatorIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteCreatorsForCurrentUser } = await import("@/server/creators")
    return deleteCreatorsForCurrentUser(data.creatorIds)
  })

export function listCreators() {
  return listCreatorsFn()
}

export function getCreator(creatorId: string) {
  return getCreatorFn({ data: { creatorId } })
}

export function bulkDeleteCreators(creatorIds: string[]) {
  return bulkDeleteCreatorsFn({ data: { creatorIds } })
}
