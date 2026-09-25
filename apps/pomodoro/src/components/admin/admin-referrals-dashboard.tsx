import * as React from "react"
import { Link } from "@tanstack/react-router"
import { GiftIcon } from "lucide-react"
import { toast } from "sonner"

import { CardTop, EmptyRow, FeedCard } from "@/components/shared/feed-card"
import {
  StatStrip,
  type StatFigure,
} from "@/components/shared/dashboard/stat-strip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  getReferralErrorMessage,
  grantReferralReward,
  type AdminReferralItem,
  type AdminReferralSummary,
} from "@/lib/api/billing/referrals"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney, formatStripeMoney } from "@/lib/format/money"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

export function AdminReferralsDashboard({
  initialData,
}: {
  initialData: AdminReferralSummary
}) {
  const [data, setData] = React.useState(initialData)
  // The referral whose free month is waiting on "Add free month?" to be answered.
  const [confirming, setConfirming] = React.useState<AdminReferralItem | null>(
    null
  )
  const [granting, setGranting] = React.useState(false)
  // State alone lets a fast double-click through before the re-render.
  const grantingRef = React.useRef(false)

  async function grantReward(referral: AdminReferralItem) {
    if (grantingRef.current) return
    grantingRef.current = true
    setGranting(true)
    try {
      const granted = await grantReferralReward(referral.id)
      setData((current) => ({
        ...current,
        pendingRewards: Math.max(0, current.pendingRewards - 1),
        items: current.items.map((item) =>
          item.id === referral.id
            ? {
                ...item,
                rewardStatus: "granted",
                rewardAmountCents: granted.amountCents,
                rewardCurrency: granted.currency,
                grantedAt: granted.grantedAt,
              }
            : item
        ),
      }))
      setConfirming(null)
      toast.success(
        `A free month (${formatStripeMoney(granted.amountCents, granted.currency)}) was added to ${referrerLabel(referral)}'s next Stripe bill.`
      )
    } catch (error) {
      showErrorToast(getReferralErrorMessage(error))
    } finally {
      grantingRef.current = false
      setGranting(false)
    }
  }

  const figures: StatFigure[] = [
    {
      key: "invited",
      label: "Invited",
      value: data.invited.toLocaleString(),
      footer: "waiting for verification",
    },
    {
      key: "joined",
      label: "Joined",
      value: data.joined.toLocaleString(),
      footer: "verified, not yet paid",
    },
    {
      key: "converted",
      label: "Converted",
      value: data.converted.toLocaleString(),
      footer: "made a first payment",
    },
    {
      key: "rewards",
      label: "Rewards waiting",
      value: data.pendingRewards.toLocaleString(),
      footer: "need a free month",
    },
  ]

  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <StatStrip figures={figures} />
      <FeedCard className="shrink-0">
        <CardTop
          icon={GiftIcon}
          title="Referral activity"
          meta={`${data.total.toLocaleString()} total`}
        />
        {data.items.length ? (
          <div className="divide-y">
            {data.items.map((referral) => (
              <div
                key={referral.id}
                className="flex flex-col gap-2 px-4 py-4 sm:px-5 lg:flex-row lg:items-center"
              >
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <Person
                    label="Referrer"
                    name={referral.referrerName}
                    email={referral.referrerEmail}
                    userId={referral.referrerUserId}
                  />
                  <Person
                    label="Invited member"
                    name={referral.referredName}
                    email={referral.referredEmail}
                    userId={referral.referredUserId}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Badge variant="outline">
                    {referral.status === "converted"
                      ? "Converted"
                      : referral.status === "joined"
                        ? "Joined"
                        : "Invited"}
                  </Badge>
                  <RewardBadge referral={referral} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {referralTimeline(referral)}
                  </span>
                  {referral.rewardStatus === "pending" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirming(referral)}
                    >
                      Add free month
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyRow>No referral links have been used yet.</EmptyRow>
        )}
        {data.total > data.items.length ? (
          <div className="border-t px-4 py-3 text-center text-xs text-muted-foreground sm:px-5">
            Showing the latest {data.items.length} of {data.total}.
          </div>
        ) : null}
      </FeedCard>
      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={confirming ? freeMonthQuestion(confirming) : null}
        description={confirming ? freeMonthConsequence(confirming) : null}
        confirmLabel="Add free month"
        // A credit on somebody's bill, not something removed.
        destructive={false}
        loading={granting}
        onConfirm={() => {
          if (confirming) void grantReward(confirming)
        }}
      />
    </div>
  )
}

function referrerLabel(referral: AdminReferralItem) {
  return referral.referrerName || referral.referrerEmail
}

/** "Add a free month ($20) to Sam's next bill?" — the amount only once known. */
function freeMonthQuestion(referral: AdminReferralItem) {
  const amount = referral.freeMonth
    ? ` (${formatStripeMoney(referral.freeMonth.amountCents, referral.freeMonth.currency)})`
    : ""
  return `Add a free month${amount} to ${referrerLabel(referral)}'s next bill?`
}

function freeMonthConsequence(referral: AdminReferralItem) {
  const name = referrerLabel(referral)
  if (!referral.freeMonth) {
    return `${name} had no paid Stripe plan when this page loaded, so there may be no bill to take a month off. If that is still true, Stripe adds nothing and the reward keeps waiting.`
  }
  const amount = formatStripeMoney(
    referral.freeMonth.amountCents,
    referral.freeMonth.currency
  )
  return `Stripe takes ${amount} off ${name}'s next bill, one month of the plan they pay for. It cannot be undone from this screen.`
}

function referralTimeline(referral: AdminReferralItem) {
  const events = [`Invited ${formatDate(referral.createdAt)}`]
  if (referral.joinedAt) events.push(`joined ${formatDate(referral.joinedAt)}`)
  if (referral.convertedAt) {
    events.push(`paid ${formatDate(referral.convertedAt)}`)
  }
  if (referral.grantedAt) {
    events.push(`reward added ${formatDate(referral.grantedAt)}`)
  }
  if (referral.revokedAt) {
    events.push(`reward reversed ${formatDate(referral.revokedAt)}`)
  }
  return events.join(" · ")
}

function Person({
  label,
  name,
  email,
  userId,
}: {
  label: string
  name: string
  email: string
  userId: string | null
}) {
  const content = (
    <>
      <span className="block truncate text-sm font-medium">{name}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {email}
      </span>
    </>
  )

  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {userId ? (
        <Link
          to="/admin/users"
          search={{ open: userId }}
          className={cn("block rounded-sm hover:underline", focusRing)}
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  )
}

function RewardBadge({ referral }: { referral: AdminReferralItem }) {
  if (referral.rewardStatus === "granted") {
    return (
      <Badge>
        {referral.rewardAmountCents && referral.rewardCurrency
          ? `${formatMoney(referral.rewardAmountCents, referral.rewardCurrency)} credit added`
          : "Free month added"}
      </Badge>
    )
  }
  if (referral.rewardStatus === "revoked") {
    return <Badge variant="destructive">Reward reversed</Badge>
  }
  if (referral.rewardStatus === "pending") {
    return <Badge variant="secondary">Reward waiting</Badge>
  }
  return null
}
