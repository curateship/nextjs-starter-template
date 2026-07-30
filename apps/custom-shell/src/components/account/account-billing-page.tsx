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
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { formatDate, formatMoney } from "@/lib/money"

// Stand-in shown while the Billing tab fetches its data on open. It mirrors the
// real layout's shape and height so the modal doesn't flash blank or resize when
// the content lands (a skeleton, not a spinner).
export function BillingTabSkeleton() {
  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
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
    </div>
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
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
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
    </div>
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
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invoices yet. They appear here after your first payment.
          </p>
        ) : (
          <TableSurface>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                    <TableCell>{invoice.number ?? "—"}</TableCell>
                    <TableCell>
                      {formatMoney(invoice.amountPaid, invoice.currency)}
                    </TableCell>
                    <TableCell className="capitalize">{invoice.status}</TableCell>
                    <TableCell className="text-right">
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
                ))}
              </TableBody>
            </Table>
          </TableSurface>
        )}
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
