import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  getFeaturedErrorMessage,
  type FeaturedPlanOffer,
} from "@/lib/api/directory/featured"
import { formatMoney } from "@/lib/format/money"
import { showErrorToast } from "@/lib/toast/error-toast"

type PurchaseState = {
  plans: FeaturedPlanOffer[]
  active: boolean
  /** Why it cannot be featured now, in words for the owner. */
  problem?: string | null
}

/**
 * The owner's Feature button on My listings, for a listing or one of their
 * events. The plans load when it first opens, and a plan's button goes
 * straight to Stripe's checkout.
 */
export function FeaturedPlansPopover({
  featuredNow,
  noun,
  load,
  start,
  size,
}: {
  /** What the page already knows, until the popover has asked the server. */
  featuredNow: boolean
  /** "listing" or "event", for the button and the messages. */
  noun: "listing" | "event"
  load: () => Promise<PurchaseState>
  start: (planId: string) => Promise<{ url: string }>
  size?: "sm"
}) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<PurchaseState | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState(false)
  const [starting, setStarting] = React.useState<string | null>(null)

  function loadPlans() {
    if (loading) return
    setLoading(true)
    setLoadError(false)
    void load()
      .then(setState)
      .catch((error) => {
        setLoadError(true)
        showErrorToast(getFeaturedErrorMessage(error))
      })
      .finally(() => setLoading(false))
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (next && !state && !loading && !loadError) loadPlans()
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size={size}>
          <SparklesIcon />{" "}
          {(state?.active ?? featuredNow) ? "Featured now" : `Feature this ${noun}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>Featured placement</PopoverTitle>
        </PopoverHeader>
        {loadError ? (
          <div className="grid min-h-16 content-center justify-items-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">Featured plans could not be loaded.</p>
            <Button type="button" size="sm" variant="outline" onClick={loadPlans}>
              Try again
            </Button>
          </div>
        ) : loading || !state ? (
          <div className="flex min-h-16 items-center justify-center">
            <Loader2Icon className="size-4 animate-spin" aria-label="Loading featured plans" />
          </div>
        ) : state.active ? (
          <p className="text-sm text-muted-foreground">
            {noun === "event"
              ? "This event is already featured. It stays at the top of the Events page until it ends."
              : "This listing is already featured. Another placement can be bought after it ends."}
          </p>
        ) : state.problem ? (
          <p className="text-sm text-muted-foreground">{state.problem}</p>
        ) : state.plans.length ? (
          <div className="grid gap-2">
            {state.plans.map((plan) => {
              const soldOut = plan.spotsLeft === 0
              return (
                <DisabledReason
                  key={plan.id}
                  disabled={soldOut}
                  reason={`Every featured spot on ${plan.categoryName} is taken. One frees up when the spot running there ends.`}
                  className="w-full"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-between py-2 text-left"
                    disabled={soldOut || Boolean(starting)}
                    onClick={() => {
                      setStarting(plan.id)
                      void start(plan.id)
                        .then(({ url }) => window.location.assign(url))
                        .catch((error) => {
                          setStarting(null)
                          showErrorToast(getFeaturedErrorMessage(error))
                        })
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {plan.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {planTerms(plan)}
                      </span>
                    </span>
                    <span className="shrink-0">
                      {starting === plan.id ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        formatMoney(plan.priceCents, plan.currency)
                      )}
                    </span>
                  </Button>
                </DisabledReason>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {noun === "event"
              ? "This site is not offering featured events yet."
              : "This site is not offering featured placement yet."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The line under a plan's name: how long it lasts, where it puts the listing,
 * and whether it can be bought at all.
 *
 * Sold out replaces the length rather than sitting beside it. An owner
 * reading a greyed row wants the reason first, and the length of a spot they
 * cannot buy is not the reason.
 */
function planTerms(plan: FeaturedPlanOffer) {
  if (plan.spotsLeft === 0) return `Sold out in ${plan.categoryName}`
  const length =
    plan.durationDays === null
      ? "Until the event ends"
      : `${plan.durationDays} days`
  if (!plan.categoryName) return length
  const left =
    plan.spotsLeft === 1 ? "1 spot left" : `${plan.spotsLeft} spots left`
  // The category's bare name, because an admin naming the plan "Top of Soup"
  // would otherwise read "Top of Soup · Top of Soup" on the same row.
  return `${length} · ${plan.categoryName} · ${left}`
}
