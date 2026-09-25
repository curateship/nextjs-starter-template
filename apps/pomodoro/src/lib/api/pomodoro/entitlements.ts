import { createServerFn } from "@tanstack/react-start"

import { userGet } from "@/server/guards"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import type { PomodoroEntitlements } from "@/lib/pomodoro/pro"

/** What this account may do — screens read it to lock controls with reasons. */
const myEntitlementsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<PomodoroEntitlements> => {
    return loadPomodoroEntitlements(context.user.id)
  })

export const loadMyEntitlements = () => myEntitlementsFn()
