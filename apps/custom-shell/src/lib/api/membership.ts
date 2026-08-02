import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"

import { loadMembershipSummary, type MembershipSummary } from "@/server/membership"
import { requireAdmin } from "@/server/security"

export type { MembershipSummary }

export const getMembershipErrorMessage = createErrorMessage(
  {},
  "We could not load the membership numbers. Please try again."
)

const loadMembershipFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin()
  return loadMembershipSummary()
})

export function loadMembership() {
  return loadMembershipFn()
}
