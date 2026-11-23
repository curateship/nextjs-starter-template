import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "../error-message"

import { featureGet } from "@/server/guards"
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

// The member home is a member's plan, referrals and feedback, so an app role
// without billing never lands here and is refused if it asks.
const loadMemberHomeFn = createServerFn({ method: "GET" })
  .middleware([featureGet("billing")])
  .handler(async ({ context }) => loadMemberHome(context.user))

export function loadMemberHomePage() {
  return loadMemberHomeFn()
}
