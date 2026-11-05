import { createServerFn } from "@tanstack/react-start"

import type { StorageSummary } from "@/lib/viral/storage"
import { adminGet, adminPost } from "@/server/guards"
import { cleanUpStorage, storageSummary } from "@/server/viral/storage"

/**
 * Settings → Storage (`workspace/docs/storage.md`). Admin only; each person
 * only ever sees and deletes their own copies.
 */

export type { StorageSummary }

const summaryFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<StorageSummary> => storageSummary(context.user.id))

export function loadStorageSummary() {
  return summaryFn()
}

const cleanFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }) => {
    const done = await cleanUpStorage(context.user.id)
    return { ...done, summary: await storageSummary(context.user.id) }
  })

/** The button: deletes the copies nobody has opened for 30 days. Vault copies stay. */
export function cleanUpStorageFn() {
  return cleanFn()
}
