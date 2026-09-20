import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "../error-message"

import { userGet } from "@/server/guards"
import {
  loadMemberHome,
  type MemberHome,
  type MemberHomeFeedback,
  type MemberHomePlan,
} from "@/server/people/member-home"
import type {
  MemberReferralItem,
  MemberReferralSummary,
} from "@/server/billing/referrals"

// Browser code reaches a server type through a `lib/api` module and nowhere
// else, so the home page's types need a door on this side.
export type { MemberHome, MemberHomeFeedback, MemberHomePlan }
export type { MemberReferralItem, MemberReferralSummary }

export const getMemberHomeErrorMessage = createErrorMessage(
  {},
  "We could not load your home page. Please try again."
)

const loadMemberHomeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadMemberHome(context.user))

export function loadMemberHomePage() {
  return loadMemberHomeFn()
}
