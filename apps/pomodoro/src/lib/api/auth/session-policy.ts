import { createServerFn } from "@tanstack/react-start"
import { adminPost } from "@/server/guards"
import { setSessionPolicy } from "@/server/auth/session-policy"
import { createErrorMessage } from "../error-message"
import { z } from "zod"

import type { ShellSessionPolicy } from "@/lib/custom-shell"

export const getSessionPolicyErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can change session security." },
  "We could not save the session security settings. Please try again."
)

const setSessionPolicyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      maxAgeDays: z.number().int().min(0).max(3650),
      idleMinutes: z.number().int().min(0).max(525600),
    })
  )
  .handler(async ({ data }): Promise<ShellSessionPolicy> => {
    return setSessionPolicy(data)
  })

export function saveSessionPolicy(policy: ShellSessionPolicy) {
  return setSessionPolicyFn({ data: policy })
}
