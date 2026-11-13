import * as React from "react"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { getFlowflyErrorMessage, loadFlowflyOverview, type FlowflyOverview, type WaitingItem } from "@/lib/api/pomodoro/flowfly"
import { formatDuration, formatShortTimeAgo } from "@/lib/format/format-time"
import { useLoad } from "@/lib/hooks/use-load"
import { FLOWFLY_WIDGET_OFFER, findFlowflyWidget, type FlowflyWidgetId } from "@/lib/pomodoro/flowfly-page"

/**
 * The Flowfly dashboard's Overview (Tyler, 13 Nov 2026): his five picked
 * widgets in the shell's grid, straight on the dashboard beside the left
 * page, each in the shell's widget card with its ⋮. It starts as two on top
 * (Focus today, Waiting) and three below (Rooms live now, Made-up members,
 * Top focusers), his answer; the left page's ⋮ → Widgets changes it.
 *
 * Every row opens where its work is: a waiting report, share or held line,
 * a live room, a member on the right.
 */
export function FlowflyOverviewGrid({
  layout,
  onChange,
  onOpenWaiting,
  onOpenRoom,
  onOpenMember,
}: {
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
  onOpenWaiting: (item: WaitingItem) => void
  onOpenRoom: (roomId: string) => void
  onOpenMember: (userId: string) => void
}) {
  const read = useLoad(loadFlowflyOverview, getFlowflyErrorMessage, { remember: "pomodoro-flowfly-overview" })

  const draw = (id: FlowflyWidgetId, data: FlowflyOverview) => {
    switch (id) {
      case "focus-today":
        return <FocusToday data={data.focusToday} />
      case "waiting":
        return <Waiting data={data.waiting} onOpen={onOpenWaiting} />
      case "rooms-live":
        return <RoomsLive data={data.roomsLive} onOpen={onOpenRoom} />
      case "madeup-today":
        return <MadeUpToday data={data.madeUp} />
      case "top-focusers":
        return <TopFocusers rows={data.topFocusers} onOpen={onOpenMember} />
    }
  }

  return (
    <WidgetGrid
      offer={FLOWFLY_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findFlowflyWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard title={widget.label} icon={<Icon />} menu={<WidgetMenu title={widget.label} />}>
            {read.data ? (
              draw(widget.id, read.data)
            ) : read.error ? (
              <ErrorRow message={read.error} onRetry={read.retry} />
            ) : (
              <LoadingRow label="Reading…" />
            )}
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
  return <p className="px-1.5 py-1.5 text-sm text-muted-foreground">{children}</p>
}

/** Big figures in a row, each with its words under it. */
function Figures({ items }: { items: { value: string; words: string }[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-3 p-3">
      {items.map((item) => (
        <div key={item.words} className="grid min-w-0 gap-0.5">
          <span className="truncate text-2xl font-semibold tabular-nums">{item.value}</span>
          <span className="truncate text-sm text-muted-foreground">{item.words}</span>
        </div>
      ))}
    </div>
  )
}

/** A row that opens where its work is, with its figure in a pill. */
function Row({ title, line, value, onPress }: { title: string; line?: string | null; value?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onPress}
    >
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{title}</span>
        {line ? <span className="min-w-0 truncate text-xs text-muted-foreground">{line}</span> : null}
      </span>
      {value ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">{value}</span>
      ) : null}
    </button>
  )
}

const hours = (seconds: number) => formatDuration(seconds * 1000, { zero: "0m" })

/** Focus today: focus finished since midnight UTC by real members. Made-up members are left out. */
function FocusToday({ data }: { data: FlowflyOverview["focusToday"] }) {
  return (
    <div className="grid content-start">
      <Figures
        items={[
          { value: hours(data.seconds), words: "focused" },
          { value: data.sessions.toLocaleString(), words: data.sessions === 1 ? "session" : "sessions" },
          { value: data.people.toLocaleString(), words: data.people === 1 ? "person focusing" : "people focusing" },
        ]}
      />
      <Quiet>Since midnight UTC, real members only.</Quiet>
    </div>
  )
}

/** Waiting: reports, shares and held lines, the five oldest. */
function Waiting({ data, onOpen }: { data: FlowflyOverview["waiting"]; onOpen: (item: WaitingItem) => void }) {
  return (
    <Scroll>
      {data.items.length ? (
        data.items.map((item) => (
          <Row
            key={`${item.kind}-${item.id}`}
            title={item.label}
            line={item.line}
            value={formatShortTimeAgo(item.since)}
            onPress={() => onOpen(item)}
          />
        ))
      ) : (
        <Quiet>Nothing is waiting for you.</Quiet>
      )}
      {data.total > data.items.length ? (
        <Quiet>
          {data.reports} reports, {data.shares} shares and {data.held} held lines in all.
        </Quiet>
      ) : null}
    </Scroll>
  )
}

/** Rooms live now: how many, who is in them, held lines, and the busiest. */
function RoomsLive({ data, onOpen }: { data: FlowflyOverview["roomsLive"]; onOpen: (roomId: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Figures
        items={[
          { value: data.open.toLocaleString(), words: data.open === 1 ? "open room" : "open rooms" },
          { value: data.people.toLocaleString(), words: "people in them" },
          { value: data.held.toLocaleString(), words: data.held === 1 ? "held line" : "held lines" },
        ]}
      />
      <Scroll>
        {data.busiest.length ? (
          data.busiest.map((room) => (
            <Row key={room.id} title={room.name} value={room.people.toLocaleString()} onPress={() => onOpen(room.id)} />
          ))
        ) : (
          <Quiet>No room is open.</Quiet>
        )}
      </Scroll>
    </div>
  )
}

/** Made-up members today: lines said, what their chat cost, and how many focused. */
function MadeUpToday({ data }: { data: FlowflyOverview["madeUp"] }) {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
  return (
    <div className="grid content-start">
      <Figures
        items={[
          { value: data.linesToday.toLocaleString(), words: "lines today" },
          { value: dollars(data.centsToday), words: "chat cost today" },
          { value: data.focusedToday.toLocaleString(), words: `of ${data.total} focused` },
        ]}
      />
      <Quiet>The chat stops for the day at {dollars(data.capCents)}.</Quiet>
      {data.paused ? <Quiet>Every made-up member is paused.</Quiet> : null}
    </div>
  )
}

/** Top focusers: this week's top five on the board, with their hours. */
function TopFocusers({
  rows,
  onOpen,
}: {
  rows: FlowflyOverview["topFocusers"]
  onOpen: (userId: string) => void
}) {
  return (
    <Scroll>
      {rows.length ? (
        rows.map((row) => (
          <Row key={row.userId} title={row.name} value={hours(row.seconds)} onPress={() => onOpen(row.userId)} />
        ))
      ) : (
        <Quiet>Nobody on the board has focused this week.</Quiet>
      )}
    </Scroll>
  )
}
