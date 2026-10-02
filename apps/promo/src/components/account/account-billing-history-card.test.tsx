import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AccountBillingHistoryCard } from "@/components/account/account-billing-history-card"
import { SUBSCRIPTION_EVENT_LIMIT } from "@/lib/billing/subscription-events"

describe("member billing history card", () => {
  it("explains an empty history without pretending older events were recorded", () => {
    const html = renderToStaticMarkup(
      <AccountBillingHistoryCard events={[]} />
    )

    expect(html).toContain("Billing history")
    expect(html).toContain("Your plan changes since Aug 3, 2026")
    expect(html).toContain("Changes before then were not recorded")
    expect(html).toContain("No billing changes have been recorded since then")
  })

  it("renders member wording, event times, and the capped-list note", () => {
    const events = Array.from(
      { length: SUBSCRIPTION_EVENT_LIMIT },
      (_, index) => ({
        id: `event-${index}`,
        kind:
          index === 0
            ? ("payment_failed" as const)
            : ("subscribed" as const),
        planName: "Team",
        previousPlanName: null,
        endsAt: null,
        createdAt: "2026-08-30T16:30:00.000Z",
      })
    )

    const html = renderToStaticMarkup(
      <AccountBillingHistoryCard events={events} />
    )

    expect(html).toContain("Your payment failed.")
    expect(html).toContain("You subscribed to Team.")
    expect(html).toContain('dateTime="2026-08-30T16:30:00.000Z"')
    expect(html).toContain(
      `Showing the most recent ${SUBSCRIPTION_EVENT_LIMIT} changes. There may be older ones.`
    )
  })
})
