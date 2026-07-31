import { createServerFn } from "@tanstack/react-start"

import { loadMembershipSummary, type MembershipSummary } from "@/server/membership"
import { requireAdmin } from "@/server/security"

export type { MembershipSummary }

const membershipErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getMembershipErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(membershipErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? membershipErrorMessages[matched]
    : "We could not load the membership numbers. Please try again."
}

const loadMembershipFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin()
  return loadMembershipSummary()
})

export function loadMembership() {
  return loadMembershipFn()
}
