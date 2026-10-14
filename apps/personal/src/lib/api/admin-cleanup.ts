import { createServerFn } from "@tanstack/react-start"

import type { CleanupCounts } from "@/lib/data-cleanup"
import { cleanUpOldData } from "@/server/cleanup"
import { adminPost } from "@/server/guards"

import { createErrorMessage } from "./error-message"

export const getCleanupErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can run the cleanup." },
  "The cleanup could not run. Nothing was deleted — please try again."
)

/**
 * The "Run cleanup now" button. Same routine and same caps as the sweep that
 * rides in on an admin's first read of the day, so pressing it can never delete
 * anything the app would not have deleted by itself.
 */
const runCleanupFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async (): Promise<CleanupCounts> => cleanUpOldData())

export function runDataCleanup() {
  return runCleanupFn()
}
