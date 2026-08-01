import * as React from "react"
import { ExternalLinkIcon } from "lucide-react"

import { showErrorToast } from "@/lib/error-toast"

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
  startCheckout,
  type BillingInvoice,
  type BillingOverview,
  type PlanOption,
} from "@/lib/api/billing"
import { formatDate } from "@/lib/format-time"
import { formatMoney } from "@/lib/money"

/**
 * Stripe's own words for an invoice, said the way a person would. Anything not
 * listed — a status Stripe adds later — falls through to the raw word rather
 * than a blank cell, so a receipt is never silently unlabelled.
 */
const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Not sent yet",
  open: "Awaiting payment",
  paid: "Paid",
  uncollectible: "Won't be collected",
  void: "Cancelled",
}

function invoiceStatusLabel(status: string) {
  const known = INVOICE_STATUS_LABELS[status]
  if (known) return known

  const raw = status.replace(/[_-]+/g, " ").trim()
  if (!raw) return "Unknown"
  return raw.charAt(0).toUpperCase() + raw.slice(1)
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
}: {
  overview: BillingOverview
  invoices: BillingInvoice[]
}) {
  const [interval, setInterval] = React.useState<BillingInterval>(
    overview.interval ?? "monthly"
  )
  const [busyPlanSlug, setBusyPlanSlug] = React.useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = React.useState(false)

  const handleSelect = React.useCallback(
    async (plan: PlanOption, selectedInterval: BillingInterval) => {
      setBusyPlanSlug(plan.slug)
      try {
        const { url } = await startCheckout(plan.slug, selectedInterval)
        window.location.href = url
      } catch (checkoutError) {
        showErrorToast(getBillingErrorMessage(checkoutError))
        setBusyPlanSlug(null)
      }
    },
    []
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

      {!overview.billingEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Payments are off</CardTitle>
            <CardDescription>
              Upgrades are unavailable until billing is switched on.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <PricingTable
          plans={overview.plans}
          currentPlanSlug={overview.planSlug}
          interval={interval}
          onIntervalChange={setInterval}
          onSelect={handleSelect}
          busyPlanSlug={busyPlanSlug}
          actionLabel={overview.isPaid ? "Switch plan" : "Upgrade"}
        />
      )}

      <InvoicesCard invoices={invoices} />
    </CardGroup>
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

function planSummary(overview: BillingOverview) {
  if (!overview.isPaid) {
    return "You are on the free plan. Upgrade any time."
  }
  if (overview.source === "manual") {
    return overview.currentPeriodEnd
      ? `An admin granted this plan until ${formatDate(overview.currentPeriodEnd)}.`
      : "An admin granted this plan. There is nothing to pay."
  }
  if (overview.status === "trialing" && overview.trialEndsAt) {
    return `Your trial runs until ${formatDate(overview.trialEndsAt)}.`
  }
  if (overview.cancelAtPeriodEnd && overview.currentPeriodEnd) {
    return `Your plan ends on ${formatDate(overview.currentPeriodEnd)}. You keep everything until then.`
  }
  if (overview.status === "past_due") {
    return "Your last payment failed. Update your card in Stripe to keep your plan."
  }
  if (overview.currentPeriodEnd) {
    return `Renews on ${formatDate(overview.currentPeriodEnd)}.`
  }

  return "Your plan is active."
}
