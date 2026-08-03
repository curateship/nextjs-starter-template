import * as React from "react"
import { ExternalLinkIcon } from "lucide-react"

import { showErrorToast } from "@/lib/error-toast"

import { AccountAiUsageCard } from "@/components/account/account-ai-usage-card"
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
import { Skeleton } from "@/components/ui/skeleton"
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
  getBillingErrorMessage,
  openBillingPortal,
  openPlanChange,
  type BillingInvoice,
  type BillingOverview,
  type CardExpiryWarning,
  type PlanOption,
} from "@/lib/api/billing"
import { describeCode } from "@/lib/code-label"
import { formatDate, formatMonthAndYear } from "@/lib/format-time"
import { formatMoney } from "@/lib/money"
import { planSummary } from "@/lib/plan-summary"

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

// Stand-in shown while the Billing tab fetches its data on open. It mirrors the
// real layout's shape and height so the modal doesn't flash blank or resize when
// the content lands (a skeleton, not a spinner).
export function BillingTabSkeleton() {
  return (
    <CardGroup className="w-full">
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="ml-auto h-9 w-36" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <Card key={index}>
            <CardHeader className="gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </CardGroup>
  )
}

export function AccountBillingPage({
  overview,
  invoices,
  cardWarning,
}: {
  overview: BillingOverview
  invoices: BillingInvoice[]
  cardWarning: CardExpiryWarning | null
}) {
  const [interval, setInterval] = React.useState<BillingInterval>(
    overview.interval ?? "monthly"
  )
  const [busyPlanSlug, setBusyPlanSlug] = React.useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = React.useState(false)
  // Someone already paying through Stripe changes plan or period in the portal,
  // never through a second checkout — see `openPlanChange`. The same flag names
  // the button, so what it says and where it goes stay in step.
  const manageInStripe = overview.isPaid && overview.hasStripeCustomer

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
          {overview.cancelAtPeriodEnd ? (
            <Badge variant="outline">Cancels at period end</Badge>
          ) : null}
          {overview.status === "past_due" ? (
            <Badge variant="destructive">Payment failed</Badge>
          ) : null}
          {overview.source === "manual" ? (
            <Badge variant="outline">Granted by an admin</Badge>
          ) : null}
          {overview.hasStripeCustomer && overview.billingEnabled ? (
            <Button
              variant="outline"
              className="ml-auto"
              onClick={handlePortal}
              disabled={openingPortal}
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Manage in Stripe
            </Button>
          ) : null}
        </CardContent>
      </Card>

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
          actionLabel={manageInStripe ? "Change in Stripe" : "Upgrade"}
        />
      )}

      <InvoicesCard invoices={invoices} />
    </CardGroup>
  )
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
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      No invoices yet. They appear here after your first payment.
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
