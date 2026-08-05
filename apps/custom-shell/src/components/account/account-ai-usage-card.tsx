import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Meter } from "@/components/ui/meter"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
} from "@/components/ui/table"
import {
  getAiErrorMessage,
  loadMyAiUsage,
  type MyAiRecentCall,
  type MyAiUsage,
} from "@/lib/api/ai"
import { formatDate, formatDateTime } from "@/lib/format-time"
import { formatMoney } from "@/lib/money"

/**
 * What the last load returned, kept for as long as the page is open.
 *
 * The Billing tab unmounts when you leave it, so without this every trip back
 * started from nothing and the card grew from a header to its full height as
 * the numbers landed — that growth is what reads as a flash. A fresh load still
 * runs on every visit; it just swaps the numbers in place.
 *
 * Only ever written from the browser (the load happens in an effect), so this
 * cannot carry one person's numbers into another's page on the server.
 */
let lastUsage: MyAiUsage | null = null

/**
 * The signed-in person's own AI numbers, on the account window's Billing tab:
 * how much of this month's allowance is gone, what it went on, and the last
 * few calls. The point is that being cut off is a number you were watching,
 * never a surprise — the 80% warning notice points here.
 *
 * The data is fetched on mount like the rest of the Billing tab, but with its
 * own loading and error states so a hiccup here cannot take the plan and
 * invoices down with it.
 */
export function AccountAiUsageCard() {
  // Starts from whatever the last load returned, so a return trip to this tab
  // draws the card at its full height straight away. See `lastUsage`.
  const [usage, setUsage] = React.useState<MyAiUsage | null>(lastUsage)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    loadMyAiUsage()
      .then((result) => {
        lastUsage = result
        if (!cancelled) setUsage(result)
      })
      .catch((loadError) => {
        if (!cancelled) setError(getAiErrorMessage(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI usage</CardTitle>
        <CardDescription>
          What your account has used this month. The counter starts fresh on
          the 1st.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* The banner only when there is nothing else to show: once `lastUsage`
            is filled, a refresh that fails leaves last time's figures standing
            rather than replacing them with an error. */}
        {error && !usage ? (
          <ErrorBanner
            message={error}
            onRetry={() => {
              setError(null)
              setReloads((count) => count + 1)
            }}
          />
        ) : !usage ? (
          // Nothing while the figures are in the air. The stand-in that sat here
          // read as a flash every time the Billing tab was opened.
          null
        ) : usage.calls === 0 && usage.recent.length === 0 ? (
          // Never used AI at all: one sentence, not an empty grid.
          <p className="text-sm text-muted-foreground">
            You haven&apos;t used any AI features yet.
            {usage.allowanceCents !== null
              ? ` Your plan gives you ${formatMoney(usage.allowanceCents)} of AI use a month.`
              : ""}
          </p>
        ) : (
          <>
            <AllowanceReading usage={usage} />
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <UsageFigure
                label="Calls this month"
                value={usage.calls.toLocaleString()}
              />
              <UsageFigure
                label="Tokens this month"
                value={usage.tokens.toLocaleString()}
              />
            </div>
            <RecentCallsTable recent={usage.recent} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The bar, when there is a ceiling to fill against. With no allowance set
 * the panel shows the usage and no bar — a missing ceiling is not a ceiling
 * of zero, and a bar with no scale would be a lie either way.
 */
function AllowanceReading({ usage }: { usage: MyAiUsage }) {
  if (usage.allowanceCents === null) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">Spent this month</span>
        <span className="text-sm font-medium tabular-nums">
          {formatMoney(usage.spentCents)} — no monthly limit on this account
        </span>
      </div>
    )
  }

  const spent = usage.spentCents
  const allowance = usage.allowanceCents
  const reached = spent >= allowance
  // The same 80% line the warning notification fires at, in whole cents.
  const nearlyThere = spent * 5 >= allowance * 4

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">Allowance used</span>
        <span className="text-sm font-medium tabular-nums">
          {formatMoney(spent)} of {formatMoney(allowance)}
        </span>
      </div>
      <Meter
        value={spent}
        max={allowance}
        label="AI allowance used this month"
        valueText={`${formatMoney(spent)} of ${formatMoney(allowance)}`}
        tone={reached ? "critical" : nearlyThere ? "warning" : "default"}
      />
      {reached ? (
        <p className="text-sm text-muted-foreground">
          Your allowance is used up, so AI features are paused until the 1st.
        </p>
      ) : null}
    </div>
  )
}

function UsageFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

/** The last few calls, newest first — what the money actually went on. */
function RecentCallsTable({ recent }: { recent: MyAiRecentCall[] }) {
  if (!recent.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has run recently.
      </p>
    )
  }

  return (
    <TableSurface>
      {/* Same wrapper as the invoices table below: four columns cannot fit a
          phone, so the table scrolls sideways inside its own surface. */}
      <ScrollArea className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead column="meta">When</TableHead>
              <TableHead column="main" className="min-w-0">
                Feature
              </TableHead>
              <TableHead column="meta" className="hidden sm:table-cell">
                Model
              </TableHead>
              <TableHead column="meta" className="text-right">
                Cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((call) => (
              <TableRow key={call.id}>
                <TableCell
                  column="mutedMeta"
                  title={formatDateTime(call.createdAt)}
                >
                  {formatDate(call.createdAt)}
                </TableCell>
                <TableCell column="main" className="min-w-0">
                  <span className="inline-flex max-w-full items-center gap-2">
                    <span className="truncate">{call.feature}</span>
                    {/* A call that never ran or never finished cost nothing,
                        and the row says why instead of showing a quiet $0. */}
                    {call.status === "failed" ? (
                      <Badge variant="outline">Failed</Badge>
                    ) : call.status === "blocked" ? (
                      <Badge variant="outline">Over the limit</Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell column="mutedMeta" className="hidden sm:table-cell">
                  <span className="block max-w-40 truncate" title={call.model}>
                    {call.model}
                  </span>
                </TableCell>
                <TableCell column="meta" className="text-right tabular-nums">
                  {formatMoney(call.costCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TableSurface>
  )
}
