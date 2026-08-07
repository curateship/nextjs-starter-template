import * as React from "react"
import { ExternalLinkIcon, PauseIcon, PlayIcon } from "lucide-react"

import { showErrorToast } from "@/lib/toast/error-toast"

import { AccountAiUsageCard } from "@/components/account/account-ai-usage-card"
import { EmptyRow } from "@/components/shared/feed-card"
import { PaymentsOffCard } from "@/components/shared/payments-off-card"
import { PricingTable, type BillingInterval } from "@/components/shared/pricing-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  getBillingErrorMessage,
  openBillingPortal,
  openPlanChange,
  setOwnPlanPaused,
  type BillingInvoice,
  type BillingOverview,
  type CardExpiryWarning,
  type PlanOption,
} from "@/lib/api/billing/billing"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { pauseRefusalCode, pausedPlanLabel } from "@/lib/billing/pause-rules"
import { describeCode } from "@/lib/format/code-label"
import { formatDate, formatMonthAndYear } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { planSummary } from "@/lib/billing/plan-summary"

/**
 * Stripe's own words for an invoice, said the way a person would. Anything not
 * listed — a status Stripe adds later — is tidied into words rather than left
 * blank, so a receipt is never silently unlabelled.
 */
const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Not sent yet",
  open: "Awaiting payment",
  paid: "Paid",
  uncollectible: "Won't be collected",
  void: "Cancelled",
}

function invoiceStatusLabel(status: string) {
  return INVOICE_STATUS_LABELS[status] ?? describeCode(status)
}

export function AccountBillingPage({
  overview,
  invoices,
  cardWarning,
  onChanged,
}: {
  overview: BillingOverview
  invoices: BillingInvoice[]
  cardWarning: CardExpiryWarning | null
  /** Re-reads the page after a pause or a resume changed what it says. */
  onChanged: () => void
}) {
  const [interval, setInterval] = React.useState<BillingInterval>(
    overview.interval ?? "monthly"
  )
  const [busyPlanSlug, setBusyPlanSlug] = React.useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = React.useState(false)
  const [confirmingPause, setConfirmingPause] = React.useState(false)
  const [runPause, pausing] = useAsyncAction(getBillingErrorMessage)
  // Why pausing is not on offer, if it is not. The button is shown either way
  // and answers the click with this, because a button that is simply missing
  // leaves somebody looking at their own plan with no way to find out why.
  const pauseRefusal = pauseRefusalCode(overview)
  // Someone who already has a subscription changes plan or period in the
  // portal, never through a second checkout — see `openPlanChange`; sending a
  // paused subscriber through checkout would leave them paying for two at once.
  // The same flag names the button, so what it says and where it goes stay in
  // step.
  const manageInStripe =
    (overview.isPaid || overview.paused) && overview.hasStripeCustomer

  const handlePause = React.useCallback(
    async (paused: boolean) => {
      const worked = await runPause(
        () => setOwnPlanPaused(paused),
        paused
          ? "Your plan is paused. Nothing more will be billed until you start it again."
          : "Your plan is running again. Billing starts from today."
      )
      if (worked) {
        setConfirmingPause(false)
        onChanged()
      }
    },
    [onChanged, runPause]
  )

  const handleSelect = React.useCallback(
    async (plan: PlanOption, selectedInterval: BillingInterval) => {
      setBusyPlanSlug(plan.slug)
      try {
        const { url } = await openPlanChange(
          manageInStripe,
          plan.slug,
          selectedInterval
        )
        window.location.href = url
      } catch (checkoutError) {
        showErrorToast(getBillingErrorMessage(checkoutError))
        setBusyPlanSlug(null)
      }
    },
    [manageInStripe]
  )

  const handlePortal = React.useCallback(async () => {
    setOpeningPortal(true)
    try {
      const { url } = await openBillingPortal()
      window.location.href = url
    } catch (portalError) {
      showErrorToast(getBillingErrorMessage(portalError))
      setOpeningPortal(false)
    }
  }, [])

  return (
    <CardGroup className="w-full">
      {/* First, because it is the only thing on this tab with a deadline. */}
      {cardWarning ? (
        <CardExpiryCard
          warning={cardWarning}
          renewsOn={overview.currentPeriodEnd}
          onUpdateCard={() => void handlePortal()}
          busy={openingPortal}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your plan</CardTitle>
          <CardDescription>{planSummary(overview)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={overview.isPaid ? "default" : "secondary"}>
            {overview.planName}
          </Badge>
          {/* A word as well as a colour: on a screen that cannot show the
              difference between the badges, "Paused" is the whole story. */}
          {overview.paused ? (
            <Badge variant="outline">
              {pausedPlanLabel(overview.pausedPlanName)}
            </Badge>
          ) : null}
          {overview.cancelAtPeriodEnd ? (
            <Badge variant="outline">Cancels at period end</Badge>
          ) : null}
          {overview.status === "past_due" ? (
            <Badge variant="destructive">Payment failed</Badge>
          ) : null}
          {overview.source === "manual" ? (
            <Badge variant="outline">Granted by an admin</Badge>
          ) : null}
          {/* Every button on this card in one right-hand group, so adding
              pause did not push "Manage in Stripe" onto its own line. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {overview.paused ? (
              <Button onClick={() => void handlePause(false)} disabled={pausing}>
                <PlayIcon className="h-4 w-4" />
                Start my plan again
              </Button>
            ) : null}
            {!overview.paused && overview.isPaid ? (
              <Button
                variant="outline"
                onClick={() =>
                  pauseRefusal
                    ? showErrorToast(getBillingErrorMessage(pauseRefusal))
                    : setConfirmingPause(true)
                }
                disabled={pausing}
              >
                <PauseIcon className="h-4 w-4" />
                Pause my plan
              </Button>
            ) : null}
            {overview.hasStripeCustomer && overview.billingEnabled ? (
              <Button
                variant="outline"
                onClick={handlePortal}
                disabled={openingPortal}
              >
                <ExternalLinkIcon className="h-4 w-4" />
                Manage in Stripe
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmingPause}
        onOpenChange={(open) => {
          if (!open) setConfirmingPause(false)
        }}
        title="Pause your plan?"
        // Pausing is reversible, so it is not dressed up as a red one-way door
        // — but it does change what you can do, so it still asks first.
        destructive={false}
        description={pauseWarning(overview.planName)}
        confirmLabel="Pause my plan"
        loading={pausing}
        onConfirm={() => void handlePause(true)}
      />

      <AccountAiUsageCard />

      {!overview.billingEnabled ? (
        <PaymentsOffCard />
      ) : (
        <PricingTable
          plans={overview.plans}
          currentPlanSlug={overview.planSlug}
          currentInterval={overview.interval}
          interval={interval}
          onIntervalChange={setInterval}
          onSelect={handleSelect}
          busyPlanSlug={busyPlanSlug}
          trialUsed={overview.trialUsed}
          actionLabel={manageInStripe ? "Change in Stripe" : "Upgrade"}
        />
      )}

      <InvoicesCard invoices={invoices} />
    </CardGroup>
  )
}

/**
 * What pausing actually costs somebody, before they agree to it.
 *
 * Three facts, and every one of them is the sort of thing people are angry
 * about afterwards: their paid features stop, the time already paid for is not
 * handed back, and starting again starts the money again.
 */
function pauseWarning(planName: string) {
  return `Your billing stops now — you will not be charged again until you start ${planName} back up. While it is paused you are on the free plan, so anything ${planName} unlocks stops working. The time you have already paid for is not refunded.`
}

/**
 * The saved card that will not survive the next renewal, said before the
 * payment fails rather than after.
 *
 * A card that has already run out and one that runs out next month need
 * different words — the first is a fact, the second is a warning — so the
 * title says which rather than making the reader work it out from a date.
 */
function CardExpiryCard({
  warning,
  renewsOn,
  onUpdateCard,
  busy,
}: {
  warning: CardExpiryWarning
  renewsOn: string | null
  onUpdateCard: () => void
  busy: boolean
}) {
  const card = `${warning.brand} ending ${warning.last4}`
  const expiry = formatMonthAndYear(warning.expYear, warning.expMonth)
  // Without a renewal date the warning is still worth making, just shorter —
  // never a sentence with a blank where the date should be.
  const renewal = renewsOn ? formatDate(renewsOn) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {warning.expired
            ? "Your saved card has expired"
            : "Your card expires before your next renewal"}
        </CardTitle>
        <CardDescription>
          {warning.expired
            ? `Your ${card} ran out in ${expiry}${renewal ? `, so the renewal on ${renewal} will fail` : ""}. Update it to keep your plan.`
            : `Your ${card} runs out in ${expiry}${renewal ? `, before your renewal on ${renewal}` : ""}. Update it now and the renewal goes through as usual.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {/* A word as well as a colour, so the state survives a screen that
            cannot show the red. */}
        <Badge variant="destructive">
          {warning.expired ? "Expired" : "Expires soon"}
        </Badge>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={onUpdateCard}
          disabled={busy}
        >
          <ExternalLinkIcon className="h-4 w-4" />
          Update card in Stripe
        </Button>
      </CardContent>
    </Card>
  )
}

function InvoicesCard({ invoices }: { invoices: BillingInvoice[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>Your last two years of receipts.</CardDescription>
      </CardHeader>
      <CardContent>
        <TableSurface>
          {/* Same wrapper the dashboard tables use: five columns cannot fit a
              phone, so the table scrolls sideways on its own with a visible
              scrollbar rather than stretching the window. */}
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead column="meta">Date</TableHead>
                  {/* The flexible column, but without the dashboard `main`
                      column's 320px floor — this table lives in a modal that is
                      only as wide as a phone. The number is also the first
                      thing to go on that phone: what you paid and whether it
                      went through matter more than the reference code. */}
                  <TableHead
                    column="main"
                    className="hidden min-w-0 sm:table-cell"
                  >
                    Invoice
                  </TableHead>
                  <TableHead column="meta">Amount</TableHead>
                  <TableHead column="meta">Status</TableHead>
                  <TableHead column="meta" className="text-right">
                    Receipt
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                    >
                      <EmptyRow>
                        No invoices yet. They appear here after your first payment.
                      </EmptyRow>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell column="mutedMeta">
                        {formatDate(invoice.createdAt)}
                      </TableCell>
                      <TableCell
                        column="main"
                        className="hidden min-w-0 sm:table-cell"
                      >
                        {/* Stripe numbers are short, but a custom prefix can
                            make one long enough to push the modal sideways. Cap
                            it and keep the whole number on hover. */}
                        <span
                          className="block max-w-56 truncate"
                          title={invoice.number ?? undefined}
                        >
                          {invoice.number ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell column="meta">
                        {formatMoney(invoice.amountPaid, invoice.currency)}
                      </TableCell>
                      <TableCell column="meta">
                        <span
                          className="block max-w-32 truncate"
                          title={invoiceStatusLabel(invoice.status)}
                        >
                          {invoiceStatusLabel(invoice.status)}
                        </span>
                      </TableCell>
                      <TableCell column="meta" className="text-right">
                        {invoice.hostedInvoiceUrl ? (
                          <a
                            className="font-medium underline-offset-4 hover:underline"
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TableSurface>
      </CardContent>
    </Card>
  )
}
