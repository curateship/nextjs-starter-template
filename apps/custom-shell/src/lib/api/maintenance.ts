import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  MAX_MAINTENANCE_MESSAGE_LENGTH,
  type ShellMaintenance,
} from "@/lib/custom-shell"

const maintenanceErrorMessages: Record<string, string> = {
  FORBIDDEN: "Only an admin can change maintenance mode.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getMaintenanceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(maintenanceErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? maintenanceErrorMessages[matched]
    : "We could not change maintenance mode. Please try again."
}

/**
 * What the maintenance page reads. No session required on purpose: it is the
 * one screen a locked-out member is sent to, and it must render for somebody
 * who is not signed in at all.
 */
const readMaintenanceFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShellMaintenance> => {
    const { readMaintenance } = await import("@/server/maintenance")
    return readMaintenance()
  }
)

const setMaintenanceFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      enabled: z.boolean(),
      message: z.string().max(MAX_MAINTENANCE_MESSAGE_LENGTH),
    })
  )
  .handler(async ({ data }): Promise<ShellMaintenance> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { setMaintenance } = await import("@/server/maintenance")

    requireAppOrigin()
    const admin = await requireAdmin()
    return setMaintenance(admin.id, data)
  })

export function loadMaintenance() {
  return readMaintenanceFn()
}

export function saveMaintenance(maintenance: ShellMaintenance) {
  return setMaintenanceFn({ data: maintenance })
}
