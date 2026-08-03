import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"

import { loadMembershipSummary, type MembershipSummary } from "@/server/membership"
import { adminGet } from "@/server/guards"

export type { MembershipSummary }

export const getMembershipErrorMessage = createErrorMessage(
  {},
  "We could not load the membership numbers. Please try again."
)

const loadMembershipFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => {
    return loadMembershipSummary()
  })

export function loadMembership() {
  return loadMembershipFn()
}
