import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ShellSessionPolicy } from "@/lib/custom-shell"

const sessionPolicyErrorMessages: Record<string, string> = {
  FORBIDDEN: "Only an admin can change session security.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getSessionPolicyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(sessionPolicyErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? sessionPolicyErrorMessages[matched]
    : "We could not save the session security settings. Please try again."
}

const setSessionPolicyFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      maxAgeDays: z.number().int().min(0).max(3650),
      idleMinutes: z.number().int().min(0).max(525600),
    })
  )
  .handler(async ({ data }): Promise<ShellSessionPolicy> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireAdmin } = await import("@/server/security")
    const { setSessionPolicy } = await import("@/server/session-policy")

    requireAppOrigin()
    await requireAdmin()
    return setSessionPolicy(data)
  })

export function saveSessionPolicy(policy: ShellSessionPolicy) {
  return setSessionPolicyFn({ data: policy })
}
