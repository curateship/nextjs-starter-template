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

/** The notice, plus who this browser is, in the one read the page makes. */
export type MaintenancePage = {
  maintenance: ShellMaintenance
  /** Whether anybody is signed in here, so the page offers a way in or a way out. */
  signedIn: boolean
  /**
   * The member an admin is currently looking at the app as, by name.
   *
   * While that view is on the app treats them as that member, so maintenance
   * mode sends them here — and "stop viewing" normally only exists inside the
   * app they can no longer reach. This is what lets the page offer it.
   */
  viewingAs: string | null
}

/**
 * What the maintenance page reads. No session required on purpose: it is the
 * one screen a locked-out member is sent to, and it must render for somebody
 * who is not signed in at all — for them the session read simply comes back
 * empty.
 */
const readMaintenanceFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MaintenancePage> => {
    const { readMaintenance } = await import("@/server/maintenance")
    const { findSessionContext } = await import("@/server/security")

    const [maintenance, session] = await Promise.all([
      readMaintenance(),
      findSessionContext(),
    ])

    return {
      maintenance,
      signedIn: Boolean(session),
      // Only the name, and only of the person this browser is already being
      // shown as — nothing here tells anybody something they cannot see.
      viewingAs: session?.viewedBy ? session.user.name : null,
    }
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
    await requireAdmin()
    return setMaintenance(data)
  })

export function loadMaintenance() {
  return readMaintenanceFn()
}

export function saveMaintenance(maintenance: ShellMaintenance) {
  return setMaintenanceFn({ data: maintenance })
}
