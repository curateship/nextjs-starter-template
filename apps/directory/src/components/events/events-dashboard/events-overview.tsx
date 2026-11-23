import type * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { getEventsDashboardErrorMessage, loadEventsOverview, type EventsOverview as Overview } from "@/lib/api/events/events-dashboard"
import { EVENTS_WIDGET_OFFER, findEventsWidget, type EventsWidgetId } from "@/lib/events/events-dashboard-page"
import { formatEventShortDay } from "@/lib/events/event-time"
import { plural } from "@/lib/format/plural"
import { useLoad } from "@/lib/hooks/use-load"

/**
 * The Events dashboard's Overview (task events/37, Part 1): the site's
 * widgets in the shell's grid, straight on the dashboard beside the left
 * page, as the Listings dashboard's Overview is. Three figures (coming up
 * this week, sign-ups this week, suggestions waiting) and two lists (most
 * viewed in 30 days, events filling up). A row opens its event.
 */
export function EventsOverview({ layout, onChange }: { layout: WidgetLayout; onChange: (layout: WidgetLayout) => void }) {
  const read = useLoad(loadEventsOverview, getEventsDashboardErrorMessage, { remember: "directory-events-overview" })

  const draw = (id: EventsWidgetId) => {
    if (read.error) return <ErrorRow message={read.error} onRetry={read.retry} className="p-3" />
    if (!read.data) return <Quiet>Reading…</Quiet>
    const data = read.data
    switch (id) {
      case "coming-this-week":
        return <Figure value={data.comingThisWeek.toLocaleString()} line="Published events today or in the next six days" />
      case "signups-this-week":
        return <Figure value={data.signUpsThisWeek.toLocaleString()} line="People who signed up in the last seven days" />
      case "waiting-suggestions":
        return (
          <div className="grid gap-1 p-3">
            <span className="text-3xl font-semibold tabular-nums">{data.waitingSuggestions.toLocaleString()}</span>
            <Link to="/admin/event-submissions" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
              {data.waitingSuggestions ? "Open Event submissions" : "Nothing waiting in Event submissions"}
            </Link>
          </div>
        )
      case "most-viewed":
        return <MostViewed data={data} />
      case "filling-up":
        return <FillingUp data={data} />
    }
  }

  return (
    <WidgetGrid
      offer={EVENTS_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findEventsWidget(id)
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

function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid p-1.5">{children}</div>
    </ScrollArea>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-sm text-muted-foreground">{children}</p>
}

function Figure({ value, line }: { value: string; line: string }) {
  return (
    <div className="grid gap-1 p-3">
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{line}</span>
    </div>
  )
}

function Row({ title, line, value, onPress }: { title: string; line?: string; value?: string; onPress: () => void }) {
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

function MostViewed({ data }: { data: Overview }) {
  const navigate = useNavigate()
  if (!data.mostViewed.length) return <Quiet>No event page has been visited in the last 30 days.</Quiet>
  return (
    <Scroll>
      {data.mostViewed.map((row) => (
        <Row
          key={row.id}
          title={row.title}
          value={`${row.views.toLocaleString()} ${plural(row.views, "view", "views")}`}
          onPress={() => void navigate({ to: "/admin/events", search: { open: row.id } })}
        />
      ))}
    </Scroll>
  )
}

function FillingUp({ data }: { data: Overview }) {
  const navigate = useNavigate()
  if (!data.filling.length) return <Quiet>No event to come takes sign-ups with a seat limit.</Quiet>
  return (
    <Scroll>
      {data.filling.map((row) => {
        const left = Math.max(0, row.seats - row.taken)
        return (
          <Row
            key={row.id}
            title={row.title}
            line={formatEventShortDay(row.startDate)}
            value={left === 0 ? "Full" : `${left} ${plural(left, "seat", "seats")} left`}
            onPress={() => void navigate({ to: "/admin/events", search: { open: row.id } })}
          />
        )
      })}
    </Scroll>
  )
}
