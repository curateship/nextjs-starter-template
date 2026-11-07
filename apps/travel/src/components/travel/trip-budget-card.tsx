import * as React from "react"
import { WalletIcon } from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { SavingInput } from "@/components/travel/saving-fields"
import { useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { focusRingInset } from "@/lib/layout/focus-ring"
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
 * The trip's money (task part 28) as a "/" block (Tyler, 7 Nov 2026: "turn
 * this bottom card into a budget block"): the total of every cost on its days
 * against a budget typed here, and a line per day, or per activity type (More
 * Travel features part 13; Tyler: "Switch: day or type"). The two tabs are
 * remembered in this browser. It folds from its heading, "Budget: CA$54 of
 * CA$100" (Tyler, 7 Nov 2026: "Add collapsible to budget and make the header
 * "Budget: $54 of $ 100""), and the fold is remembered in this browser too,
 * under the old Money card's storage id. `editable` is false when the note
 * can't be written in, so the budget can't be typed either. `tools` sit at
 * the heading's right, such as the block's bin.
 */
export function BudgetCard({ editable = true, tools }: { editable?: boolean; tools?: React.ReactNode }) {
  const { page, readOnly } = useTrip()
  const { trip } = page
  const saveTripPatch = useSaveTrip()
  const { total, perDay, perType, ideas } = tripTotals(trip.days, page.activities)
  const [view, setView] = useRememberedChoice(MONEY_VIEW_KEY, "day", MONEY_VIEWS)
  const money = (cents: number) => formatMoney(cents, trip.currency)
  const over = trip.budgetCents !== null && total > trip.budgetCents
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard("travel-trip-budget"))
  // A description and a trip note can each hold one, so each input has its own id.
  const inputId = React.useId()

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="grid grid-cols-[minmax(0,1fr)]">
      {/* The heading is the button that folds the block, with no arrow (Tyler, 7 Nov 2026: "clicking on header
          to toggle is enough"). Its size is set here, so the note's own heading styles never reach it: 20% under
          the 16px it was ("reduce header font by 30%", then "increase by 10"). */}
      <div className="flex items-center gap-2 py-2.5 pr-2.5 pl-4">
        <WalletIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="m-0! min-w-0 flex-1 text-[0.8rem]! leading-tight! font-semibold">
          <CollapsibleTrigger asChild>
            <button type="button" className={cn("w-full cursor-pointer rounded-md text-left select-none", focusRingInset)}>
              {/* Each amount stays on one line, so a narrow panel never splits a number in two. */}
              Budget: <span className="whitespace-nowrap">{money(total)}</span>
              {trip.budgetCents !== null ? (
                <>
                  {" of "}
                  <span className="whitespace-nowrap">{money(trip.budgetCents)}</span>
                </>
              ) : null}
            </button>
          </CollapsibleTrigger>
        </h2>
        {tools}
      </div>
      <CollapsibleContent data-collapse-key={noFlashKey} className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 pb-4">
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
          <p className="m-0! text-xs text-destructive">{money(total - trip.budgetCents!)} over the budget.</p>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor={inputId}>Budget ({trip.currency})</Label>
          <SavingInput
            id={inputId}
            disabled={readOnly || !editable}
            inputMode="decimal"
            value={trip.budgetCents === null ? "" : money(trip.budgetCents)}
            placeholder="No budget"
            className="bg-background"
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
        {/* As wide as the block and no wider, so a narrow panel never pushes the switch past its edge. */}
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
        <dl className="m-0! grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-xs">
          {view === "day" ? (
            perDay.map((cents, index) => (
              <React.Fragment key={index}>
                <dt className="truncate text-muted-foreground">{dayLabel(index + 1, trip.startDate)}</dt>
                <dd className="m-0! text-right tabular-nums">{cents ? money(cents) : "–"}</dd>
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
                <dd className="m-0! text-right tabular-nums">{money(cents)}</dd>
              </React.Fragment>
            ))
          )}
          {ideas ? (
            <>
              <dt className="truncate text-muted-foreground">Ideas, not counted</dt>
              <dd className="m-0! text-right text-muted-foreground tabular-nums">{money(ideas)}</dd>
            </>
          ) : null}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  )
}
