import * as React from "react"
import { WalletIcon } from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { SavingInput } from "@/components/travel/saving-fields"
import { useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { FoldHeading } from "@/components/travel/fold-heading"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Meter } from "@/components/ui/meter"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { saveTrip } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { collapseStorageKey, useRememberedChoice, useRememberedCollapse } from "@/lib/remembered-choice"
import { spendingByType, tripTotals } from "@/lib/travel/budget"
import { MONEY_VIEW_KEY } from "@/lib/travel/panel-keys"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { formatMoney, parseMoney } from "@/lib/travel/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { FOOTER_CARD_BODY } from "@/lib/travel/panel-gutter"
import { cn } from "@/lib/utils"

/** Saves one change to the trip, then reloads it. False when it was refused. */
export function useSaveTrip() {
  const { page, refresh } = useTrip()
  const [run] = useAsyncAction(getTravelErrorMessage)
  return React.useCallback(
    (patch: Omit<Parameters<typeof saveTrip>[0], "tripId">) =>
      run(async () => {
        await saveTrip({ tripId: page.trip.id, ...patch })
        await refresh()
      }),
    [page.trip.id, refresh, run]
  )
}

const MONEY_VIEWS = ["day", "type"] as const

/**
 * The trip's money (task part 28): the total of every cost on its days
 * against a budget typed here, and a line per day, or per activity type
 * (More Travel features part 13; Tyler: "Switch: day or type"). The two tabs
 * are remembered in this browser.
 */
export function BudgetCard() {
  const { page, readOnly } = useTrip()
  const { trip } = page
  const saveTripPatch = useSaveTrip()
  const { total, perDay, perType, ideas } = tripTotals(trip.days, page.activities)
  const [view, setView] = useRememberedChoice(MONEY_VIEW_KEY, "day", MONEY_VIEWS)
  const money = (cents: number) => formatMoney(cents, trip.currency)
  const over = trip.budgetCents !== null && total > trip.budgetCents
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard("travel-trip-budget"))

  return (
    // A folding card in the left panel's footer (the Admin 3 panel design, 6 Nov 2026), keeping the old
    // card's storage id, so a fold this browser already remembered stays.
    <Collapsible open={open} onOpenChange={setOpen} className="grid grid-cols-[minmax(0,1fr)]">
      <FoldHeading
        band
        icon={<WalletIcon />}
        title="Money"
        line={trip.budgetCents !== null ? `${money(total)} of ${money(trip.budgetCents)}` : money(total)}
        open={open}
      />
      <CollapsibleContent data-collapse-key={noFlashKey} className={cn("grid grid-cols-[minmax(0,1fr)] gap-3", FOOTER_CARD_BODY)}>
        {trip.budgetCents !== null ? (
          <Meter
            value={total}
            max={trip.budgetCents}
            label="Spent of the budget"
            valueText={`${money(total)} of ${money(trip.budgetCents)}`}
            tone={over ? "critical" : "default"}
          />
        ) : null}
        {over ? (
          <p className="text-xs text-destructive">{money(total - trip.budgetCents!)} over the budget.</p>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="trip-budget">Budget ({trip.currency})</Label>
          <SavingInput
            id="trip-budget"
            disabled={readOnly}
            inputMode="decimal"
            value={trip.budgetCents === null ? "" : money(trip.budgetCents)}
            placeholder="No budget"
            onSave={(next) => {
              const text = next.replace(/[^\d.,]/g, "")
              if (!text) return saveTripPatch({ budgetCents: null })
              const cents = parseMoney(text)
              if (cents === null) {
                showErrorToast("Type the budget as a number, such as 2000.")
                return Promise.resolve(false)
              }
              return saveTripPatch({ budgetCents: cents })
            }}
          />
        </div>
        {/* As wide as the card and no wider, so a narrow panel never pushes the switch past its edge. */}
        <Tabs value={view} onValueChange={(next) => setView(next as (typeof MONEY_VIEWS)[number])} className="min-w-0">
          <TabsList aria-label="Show the money" className="w-full min-w-0">
            <TabsTrigger value="day" className="min-w-0 flex-1">
              <span className="truncate">By day</span>
            </TabsTrigger>
            <TabsTrigger value="type" className="min-w-0 flex-1">
              <span className="truncate">By type</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-xs">
          {view === "day" ? (
            perDay.map((cents, index) => (
              <React.Fragment key={index}>
                <dt className="truncate text-muted-foreground">{dayLabel(index + 1, trip.startDate)}</dt>
                <dd className="text-right tabular-nums">{cents ? money(cents) : "–"}</dd>
              </React.Fragment>
            ))
          ) : total === 0 ? (
            <div className="col-span-2 text-muted-foreground">No costs on the trip's days yet.</div>
          ) : (
            spendingByType(perType, page.types).map(({ type, cents }) => (
              <React.Fragment key={type?.id ?? "other"}>
                <dt className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <ActivityTypeIcon type={type} className="size-3" />
                  <span className="truncate">{type?.name ?? "Other"}</span>
                </dt>
                <dd className="text-right tabular-nums">{money(cents)}</dd>
              </React.Fragment>
            ))
          )}
          {ideas ? (
            <>
              <dt className="truncate text-muted-foreground">Ideas, not counted</dt>
              <dd className="text-right text-muted-foreground tabular-nums">{money(ideas)}</dd>
            </>
          ) : null}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  )
}
