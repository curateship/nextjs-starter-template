import type * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import {
  getListingsDashboardErrorMessage,
  loadListingsOverview,
  type ListingsOverview as Overview,
} from "@/lib/api/directory/listings-dashboard"
import { findListingsWidget, LISTINGS_WIDGET_OFFER, type ListingsWidgetId } from "@/lib/directory/listings-dashboard-page"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { plural } from "@/lib/format/plural"
import { useLoad } from "@/lib/hooks/use-load"

/**
 * The Listings dashboard's Overview (Tyler, 18 Nov 2026): the site's
 * widgets in the shell's grid, straight on the dashboard beside the left
 * page, each in the shell's widget card with its ⋮. They are what sat above
 * and beside the old pages' tables: Featured's income, its running
 * placements and the plans offered, Most saved listings, and Outreach's
 * Send history. A row opens its record: a saved listing on Listings, a send
 * on Outreach (Tyler's polish pick: "Read-only rows open their listing").
 */
export function ListingsOverview({ layout, onChange }: { layout: WidgetLayout; onChange: (layout: WidgetLayout) => void }) {
  const read = useLoad(loadListingsOverview, getListingsDashboardErrorMessage, { remember: "directory-listings-overview" })

  const draw = (id: ListingsWidgetId) => {
    if (read.error) return <ErrorRow message={read.error} onRetry={read.retry} className="p-3" />
    if (!read.data) return <Quiet>Reading…</Quiet>
    switch (id) {
      case "featured-income":
        return <IncomeWidget data={read.data} />
      case "featured-running":
        return <Figure value={read.data.running.toLocaleString()} line="Featured placements running now" />
      case "plans-offered":
        return (
          <Figure
            value={read.data.plansOffered.toLocaleString()}
            line={`${read.data.plans} ${plural(read.data.plans, "plan", "plans")} in all, the rest off sale`}
          />
        )
      case "most-saved":
        return <MostSavedWidget data={read.data} />
      case "send-history":
        return <SendsWidget data={read.data} />
    }
  }

  return (
    <WidgetGrid
      offer={LISTINGS_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findListingsWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard title={widget.label} icon={<Icon />} menu={<WidgetMenu title={widget.label} />}>
            {draw(widget.id)}
          </WidgetCard>
        )
      }}
    />
  )
}

/** A widget's list that scrolls inside its card. */
function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid p-1.5">{children}</div>
    </ScrollArea>
  )
}

/** The widget's one line when there is nothing to show. */
function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-sm text-muted-foreground">{children}</p>
}

/** One big figure and the line saying what it counts. */
function Figure({ value, line }: { value: string; line: string }) {
  return (
    <div className="grid gap-1 p-3">
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{line}</span>
    </div>
  )
}

/** A row that opens its record, with its figure in a pill. */
function Row({ title, line, value, onPress }: { title: string; line?: string | null; value?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onPress}
    >
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{title}</span>
        {line ? <span className="truncate text-xs text-muted-foreground">{line}</span> : null}
      </span>
      {value ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">{value}</span>
      ) : null}
    </button>
  )
}

/** Every featured sale's money, a figure per currency. */
function IncomeWidget({ data }: { data: Overview }) {
  if (!data.revenue.length) return <Quiet>No featured spot has been bought yet.</Quiet>
  return (
    <div className="grid gap-2 p-3">
      {data.revenue.map((row) => (
        <div key={row.currency} className="grid gap-0.5">
          <span className="text-3xl font-semibold tabular-nums">{formatMoney(row.amount, row.currency)}</span>
          <span className="text-sm text-muted-foreground">
            From {row.purchases.toLocaleString()} {plural(row.purchases, "purchase", "purchases")}
          </span>
        </div>
      ))}
    </div>
  )
}

function MostSavedWidget({ data }: { data: Overview }) {
  const navigate = useNavigate()
  if (!data.mostSaved.length) return <Quiet>No listing has been saved on this site yet.</Quiet>
  return (
    <Scroll>
      {data.mostSaved.map((row) => (
        <Row
          key={row.id}
          title={row.title}
          line={`${row.people.toLocaleString()} ${plural(row.people, "person", "people")}`}
          value={row.saves.toLocaleString()}
          onPress={() => void navigate({ to: "/admin/listings", search: { open: row.id } })}
        />
      ))}
    </Scroll>
  )
}

const SEND_WORDS: Record<Overview["sends"][number]["status"], string> = {
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
}

function SendsWidget({ data }: { data: Overview }) {
  const navigate = useNavigate()
  if (!data.sends.length) return <Quiet>No invitation has been sent yet.</Quiet>
  return (
    <Scroll>
      {data.sends.map((row) => (
        <Row
          key={row.id}
          title={row.title}
          line={`${SEND_WORDS[row.status]} to ${row.email}`}
          value={formatDate(row.at)}
          onPress={() => void navigate({ to: "/admin/listings", search: { section: "outreach", open: row.listingId } })}
        />
      ))}
    </Scroll>
  )
}
