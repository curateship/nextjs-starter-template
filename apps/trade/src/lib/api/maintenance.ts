import { createServerFn } from "@tanstack/react-start"
import { readMaintenance, setMaintenance } from "@/server/maintenance"
import { findSessionContext } from "@/server/auth/security"
import { adminPost } from "@/server/guards"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

import {
  MAX_MAINTENANCE_MESSAGE_LENGTH,
  type ShellMaintenance,
} from "@/lib/custom-shell"

export const getMaintenanceErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can change maintenance mode." },
  "We could not change maintenance mode. Please try again."
)

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
  .middleware([adminPost])
  .inputValidator(
    z.object({
      enabled: z.boolean(),
      message: z.string().max(MAX_MAINTENANCE_MESSAGE_LENGTH),
    })
  )
  .handler(async ({ data }): Promise<ShellMaintenance> => {
    return setMaintenance(data)
  })

export function loadMaintenance() {
  return readMaintenanceFn()
}

export function saveMaintenance(maintenance: ShellMaintenance) {
  return setMaintenanceFn({ data: maintenance })
}
