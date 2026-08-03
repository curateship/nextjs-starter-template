import {
  AlertTriangleIcon,
  CreditCardIcon,
  HourglassIcon,
  Trash2Icon,
  UserMinusIcon,
  UserXIcon,
} from "lucide-react"

import type { NeedsYouItem } from "@/components/shared/needs-you-card"
import type { MembershipPage } from "@/lib/api/membership"
import { formatDate } from "@/lib/format-time"
import { plural } from "@/lib/plural"

/**
 * What members and money have waiting on somebody, most expensive to ignore
 * first. A row only appears while it is true.
 *
 * These are deliberately not the Overview's rows. That card is about what the
 * app has been telling people — unopened notices, unpublished drafts, feedback
 * with no reply. This one is only ever about somebody's account or somebody's
 * payment, so the two lists never say the same thing twice.
 *
 * The order below is what it costs to leave alone. A chargeback has a deadline
 * and the money goes automatically when it passes, so nothing outranks it. A
 * trial is last because it is not a job, it is a heads-up.
 */
export function buildMembershipNeedsYou(
  summary: MembershipPage
): NeedsYouItem[] {
  const { revenue, disputes } = summary
  const items: NeedsYouItem[] = []

  if (disputes.open.length) {
    const soonest = disputes.open.find((dispute) => dispute.evidenceDueBy)
    items.push({
      id: "chargebacks",
      icon: AlertTriangleIcon,
      title: `${disputes.open.length.toLocaleString()} open ${plural(disputes.open.length, "chargeback")}`,
      detail: soonest?.evidenceDueBy
        ? `Evidence due to Stripe by ${formatDate(soonest.evidenceDueBy)} — miss it and the money goes`
        : "Answer it in Stripe before the deadline, or the money goes",
      action: "Answer",
      to: "/admin/membership",
      hash: "chargebacks",
    })
  }

  if (summary.failedPayments > 0) {
    items.push({
      id: "failed-payments",
      icon: CreditCardIcon,
      title: `${summary.failedPayments.toLocaleString()} ${plural(summary.failedPayments, "payment")} failed this week`,
      detail: "Stripe could not take the money. The plan ends if it keeps failing",
      action: "Review",
      to: "/admin/users",
    })
  }

  if (summary.suspended > 0) {
    items.push({
      id: "suspended",
      icon: UserXIcon,
      title: `${summary.suspended.toLocaleString()} suspended ${plural(summary.suspended, "account")}`,
      detail: "Nobody suspended can sign in until somebody lifts it",
      action: "Review",
      to: "/admin/users",
    })
  }

  if (summary.pendingDeletion > 0) {
    items.push({
      id: "pending-deletion",
      icon: Trash2Icon,
      title: `${summary.pendingDeletion.toLocaleString()} ${plural(summary.pendingDeletion, "account")} waiting to be deleted`,
      detail: "They can still be brought back until the restore window runs out",
      action: "Review",
      to: "/admin/users",
    })
  }

  if (revenue.cancelling > 0) {
    items.push({
      id: "cancelling",
      icon: UserMinusIcon,
      title: `${revenue.cancelling.toLocaleString()} ${plural(revenue.cancelling, "subscription")} ending`,
      detail: "They keep what they are paying for until their period runs out",
      action: "Review",
      to: "/admin/users",
    })
  }

  if (revenue.trialing > 0) {
    items.push({
      id: "trialing",
      icon: HourglassIcon,
      title: `${revenue.trialing.toLocaleString()} on a trial`,
      detail: "Nobody on a trial has been charged anything yet",
      action: "Review",
      to: "/admin/users",
    })
  }

  return items
}
