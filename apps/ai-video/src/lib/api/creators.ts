import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { CreatorItem, CreatorListResponse } from "@/server/creators"
import type { WatchSyncResult } from "@/server/creator-watch"

export type { CreatorItem, CreatorListResponse, WatchSyncResult }

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

const setCreatorWatchFn = createServerFn({ method: "POST" })
  .inputValidator(creatorIdSchema.extend({ watch: z.boolean() }))
  .handler(
    async ({ data }): Promise<{ creatorId: string; watch: boolean }> => {
      const { setCreatorWatchForCurrentUser } = await import(
        "@/server/creator-watch"
      )
      return setCreatorWatchForCurrentUser(data.creatorId, data.watch)
    }
  )

const syncCreatorWatchFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<WatchSyncResult> => {
    const { syncCreatorWatchForCurrentUser } = await import(
      "@/server/creator-watch"
    )
    return syncCreatorWatchForCurrentUser()
  }
)

export function setCreatorWatch(creatorId: string, watch: boolean) {
  return setCreatorWatchFn({ data: { creatorId, watch } })
}

export function syncCreatorWatch() {
  return syncCreatorWatchFn()
}

export function listCreators() {
  return listCreatorsFn()
}

export function getCreator(creatorId: string) {
  return getCreatorFn({ data: { creatorId } })
}

export function bulkDeleteCreators(creatorIds: string[]) {
  return bulkDeleteCreatorsFn({ data: { creatorIds } })
}
