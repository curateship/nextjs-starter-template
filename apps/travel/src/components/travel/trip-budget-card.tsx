import * as React from "react"

import { dayLabel } from "@/components/travel/new-activity"
import { SavingInput } from "@/components/travel/saving-fields"
import { useTrip } from "@/components/travel/trip-context"
import { PanelCard } from "@/components/shared/panel-card"
import { Label } from "@/components/ui/label"
import { Meter } from "@/components/ui/meter"
import { saveTrip } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { tripTotals } from "@/lib/travel/budget"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { formatMoney, parseMoney } from "@/lib/travel/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

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

/**
 * The trip's money (task part 28): the total of every cost on its days
 * against a budget typed here, and a line per day.
 */
export function BudgetCard() {
  const { page, readOnly } = useTrip()
  const { trip } = page
  const saveTripPatch = useSaveTrip()
  const { total, perDay, ideas } = tripTotals(trip.days, page.activities)
  const money = (cents: number) => formatMoney(cents, trip.currency)
  const over = trip.budgetCents !== null && total > trip.budgetCents

  return (
    <PanelCard
      storageId="travel-trip-budget"
      title="Money"
      meta={trip.budgetCents !== null ? `${money(total)} of ${money(trip.budgetCents)}` : money(total)}
    >
      <div className="grid gap-3">
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
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-xs">
          {perDay.map((cents, index) => (
            <React.Fragment key={index}>
              <dt className="truncate text-muted-foreground">{dayLabel(index + 1, trip.startDate)}</dt>
              <dd className="text-right tabular-nums">{cents ? money(cents) : "–"}</dd>
            </React.Fragment>
          ))}
          {ideas ? (
            <>
              <dt className="truncate text-muted-foreground">Ideas, not counted</dt>
              <dd className="text-right text-muted-foreground tabular-nums">{money(ideas)}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </PanelCard>
  )
}
