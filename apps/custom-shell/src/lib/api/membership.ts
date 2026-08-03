import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "./error-message"

import {
  loadMembershipPage,
  type MembershipActivityItem,
  type MembershipPage,
  type MembershipSummary,
} from "@/server/membership"
import { adminGet } from "@/server/guards"

export type { MembershipActivityItem, MembershipPage, MembershipSummary }

export const getMembershipErrorMessage = createErrorMessage(
  {},
  "We could not load the membership numbers. Please try again."
)

const loadMembershipFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => {
    return loadMembershipPage()
  })

export function loadMembership() {
  return loadMembershipFn()
}
