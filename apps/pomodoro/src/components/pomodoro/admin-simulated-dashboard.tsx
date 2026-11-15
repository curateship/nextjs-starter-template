import * as React from "react"
import { BotIcon, CalendarClockIcon, MessageSquareTextIcon, PauseIcon, PlayIcon } from "lucide-react"

import { Switch } from "@/components/ui/switch"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { ViewMenu } from "@/components/shared/view-menu"
import { PanelCard } from "@/components/shared/panel-card"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminMemberRecord } from "@/components/pomodoro/admin-member-record"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import {
  getSimulatedErrorMessage,
  listSimulatedLineRows,
  listSimulatedWatchRows,
  loadSimulatedOverview,
  setSimulatedMembersPaused,
  type ScheduleHour,
  type SimulatedLineRow,
  type SimulatedSummary,
  type SimulatedWatchRow,
} from "@/lib/api/pomodoro/admin-simulated"
import { formatClockTime, formatDateTime, formatDuration } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { SimulatedSort, SimulatedTab } from "@/lib/pomodoro/admin-lists"
import type { MadeupPart } from "@/lib/pomodoro/flowfly-search"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Members → Made-up on the Flowfly dashboard: the watch page for the made-up
 * members (live activity task 05, Parts 2 to 4). Its three tables became one
 * list with a view dropdown (a tab's own choices are a dropdown, never a
 * second row): Members, every account with its pause switch, opening the
 * member on the right; Schedule, today's plan before it runs; and Lines,
 * every line they said, opening on the right with the brief behind it. The
 * line under each list says what they did today and what the chat cost.
 * Lines only reach a room once Preview has been pressed on the voice card
 * in Settings (`made-up-members.md`). See "Your controls" there.
 */

type MadeupSearch = {
  part?: MadeupPart
  tab?: SimulatedTab
  q?: string
  sort?: SimulatedSort
  direction?: "asc" | "desc"
  page?: number
  lines?: number
}

type WatchPage = {
  list: { rows: SimulatedWatchRow[]; total: number }
  lines: { rows: SimulatedLineRow[]; total: number }
  summary: SimulatedSummary
  schedule: ScheduleHour[]
  pageSize: number
}

const noSubscription = () => () => {}

/**
 * True once the page is running in the browser. Every time here is worked
 * out from the reader's own clock and time zone, which the server does not
 * have, so a time drawn on the server differed from the browser's and React
 * threw away the page (error 418 on pomoder.com, 11 Oct 2026). Until then a
 * time is a dash.
 */
function useInBrowser() {
  return React.useSyncExternalStore(noSubscription, () => true, () => false)
}

/** The summary and the schedule are read again this often while the list is open. */
const OVERVIEW_REFRESH_MS = 60_000

const PARTS: Record<MadeupPart, string> = { members: "Members", schedule: "Schedule", lines: "Lines" }

export function AdminSimulatedDashboard({ initial }: { initial: WatchPage }) {
  const search = useFlowflySearch<MadeupSearch>()
  const setListSearch = useListSearchNavigate()
  const part: MadeupPart = search.part ?? "members"
  const [overview, setOverview] = React.useState({ summary: initial.summary, schedule: initial.schedule })
  const refreshOverview = React.useCallback(() => {
    loadSimulatedOverview().then(setOverview, () => {
      // The figures on screen stay; the next minute tries again.
    })
  }, [])
  React.useEffect(() => {
    const timer = setInterval(refreshOverview, OVERVIEW_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshOverview])

  const view = (
    <ViewMenu
      label="Which list"
      value={part}
      onValueChange={(value) => setListSearch({ part: value === "members" ? undefined : value, open: undefined, page: undefined, lines: undefined, q: undefined })}
      choices={(Object.keys(PARTS) as MadeupPart[]).map((value) => ({ value, label: PARTS[value] }))}
    />
  )
  const footnote = <SummaryLine summary={overview.summary} />

  if (part === "schedule") return <ScheduleList key="schedule" schedule={overview.schedule} view={view} footnote={footnote} />
  if (part === "lines") return <LinesList key="lines" initial={initial.lines} initialPageSize={initial.pageSize} view={view} footnote={footnote} />
  return <AccountsList key="members" initial={initial.list} initialPageSize={initial.pageSize} onChanged={refreshOverview} view={view} footnote={footnote} />
}

/** Cents with the fractions kept while under one, since a line costs about a twentieth of one. */
function formatCents(cents: number) {
  if (cents === 0) return "0¢"
  return cents < 1 ? `${cents.toFixed(2)}¢` : `${Math.round(cents)}¢`
}

/** What the made-up members did today, under every part's list. */
function SummaryLine({ summary }: { summary: SimulatedSummary }) {
  const inBrowser = useInBrowser()
  const off = (
    [
      ["sessions", "Sessions"],
      ["rooms", "Rooms"],
      ["chat", "Chat"],
      ["follows", "Follows and cheers"],
      ["joinReal", "Join real rooms"],
    ] as const
  )
    .filter(([key]) => !summary.switches[key])
    .map(([, label]) => label)
  const lastReal = !summary.lastRealSeenAt ? "never" : inBrowser ? formatDateTime(summary.lastRealSeenAt) : "-"
  return (
    <span className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <span>
        {summary.focusedToday} of {summary.total} focused today, {summary.roomsOpen}{" "}
        {plural(summary.roomsOpen, "made-up room", "made-up rooms")} open, {summary.linesToday}{" "}
        {plural(summary.linesToday, "line", "lines")} said for {formatCents(summary.centsToday)} of{" "}
        {formatCents(summary.capCents)} today (UTC)
        {summary.paused ? `, ${summary.paused} paused` : ""}.
      </span>
      <span>
        Somebody real was last on the site: {lastReal}.
        {summary.pausedAll ? " Pause everything is on." : ""}
        {off.length ? ` Switched off: ${off.join(", ")}.` : ""}
      </span>
    </span>
  )
}

const SHOW_LABELS: Record<SimulatedTab, string> = { today: "Today", paused: "Paused", all: "All" }

const ACCOUNT_COLUMNS: TableHeaderColumn<SimulatedSort | "where" | "room" | "paused">[] = [
  { key: "name", label: "Member", column: "main" },
  { key: "where", label: "Local time", column: "meta", sortable: false, className: "hidden md:hidden @4xl:table-cell" },
  { key: "hours", label: "Today", column: "meta" },
  { key: "room", label: "Room", column: "meta", sortable: false, className: "hidden md:hidden @5xl:table-cell" },
  { key: "lines", label: "Lines today", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
  { key: "paused", label: "Paused", column: "meta", sortable: false },
]

/** Every made-up account with its pause switch; a row opens the member on the right. */
function AccountsList({
  initial,
  initialPageSize,
  onChanged,
  view,
  footnote,
}: {
  initial: { rows: SimulatedWatchRow[]; total: number }
  initialPageSize: number
  onChanged: () => void
  view: React.ReactNode
  footnote: React.ReactNode
}) {
  const search = useFlowflySearch<MadeupSearch>()
  const setListSearch = useListSearchNavigate()
  const tab: SimulatedTab = search.tab ?? "today"
  const query = search.q ?? ""
  const sort: SimulatedSort = search.sort ?? "hours"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const load = React.useCallback(
    (pageSize: number) => listSimulatedWatchRows({ tab, search: query, sort, direction, page, pageSize }),
    [direction, page, query, sort, tab]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SimulatedSort>({ sort, direction }, (column) => (column === "name" ? "asc" : "desc"))
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.userId), [list.rows])
  const inBrowser = useInBrowser()
  const [busy, setBusy] = React.useState(false)

  const setPaused = async (ids: string[], paused: boolean) => {
    setBusy(true)
    try {
      await setSimulatedMembersPaused(ids, paused)
      selection.clear()
      await list.refresh()
      onChanged()
    } catch (error) {
      showErrorToast(getSimulatedErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminListTable
      noun="made-up members"
      emptyText={
        tab === "today" ? "None of them has focused, talked or sat in a room today yet." : tab === "paused" ? "Nobody is paused." : undefined
      }
      columns={ACCOUNT_COLUMNS}
      sort={sort}
      direction={direction}
      onSort={(column) => {
        if (column === "name" || column === "hours" || column === "lines") toggleSort(column)
      }}
      selection={{ noun: "made-up members", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "simulated-search",
        label: "Search made-up members",
        placeholder: "Search name or handle",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      filter={{
        count: tab !== "today" ? 1 : 0,
        onClear: () => setListSearch({ tab: undefined, page: undefined }),
        children: (
          <FilterPick
            id="madeup-show"
            label="Show"
            value={tab === "today" ? undefined : tab}
            any="Busy today"
            options={[
              ["paused", SHOW_LABELS.paused],
              ["all", SHOW_LABELS.all],
            ]}
            onChange={(next) => setListSearch({ tab: next, page: undefined })}
          />
        ),
      }}
      view={view}
      footnote={footnote}
      bulk={(ids, menu) => (
        <>
          <SelectedMenuRow
            onClick={() => {
              menu.close()
              void setPaused(ids, true)
            }}
          >
            <PauseIcon className="size-4" />
            Pause
          </SelectedMenuRow>
          <SelectedMenuRow
            onClick={() => {
              menu.close()
              void setPaused(ids, false)
            }}
          >
            <PlayIcon className="size-4" />
            Unpause
          </SelectedMenuRow>
        </>
      )}
      bulkBusy={busy}
      rowIds={rowIds}
      record={{
        label: "Member",
        content: (openId) =>
          openId ? (
            <AdminMemberRecord key={openId} userId={openId} />
          ) : (
            <NoRecord title="Member" icon={<BotIcon aria-hidden />} line="No made-up member matches." />
          ),
      }}
    >
      {list.rows.map((row) => (
        <AdminRow key={row.userId} id={row.userId} label={row.name}>
          <MainCell name={row.name}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{row.handle ? `/u/${row.handle}` : "No handle"}</span>
          </MainCell>
          <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
            <span className="block">{inBrowser ? localTime(row.timezone) : "-"}</span>
            <span className="block max-w-40 truncate text-xs text-muted-foreground">{row.timezone}</span>
          </TableCell>
          <TableCell column="meta">{formatDuration(row.todaySeconds * 1000, { zero: "-" })}</TableCell>
          <TableCell column="meta" className="hidden md:hidden @5xl:table-cell">
            <span className="block max-w-48 truncate">{row.roomName ?? "-"}</span>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @3xl:table-cell">
            {row.linesToday ? `${row.linesToday} · ${formatCents(row.centsToday)}` : "-"}
          </TableCell>
          <TableCell column="meta">
            <Switch
              checked={Boolean(row.pausedAt)}
              disabled={busy}
              aria-label={row.pausedAt ? `Unpause ${row.name}` : `Pause ${row.name}`}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(paused) => void setPaused([row.userId], paused)}
            />
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}

/**
 * Today's schedule before it runs: each hour of the next 24, who starts a
 * focus and which rooms open, in the reader's own time. An hour opens on
 * the right with everybody in it.
 */
function ScheduleList({ schedule, view, footnote }: { schedule: ScheduleHour[]; view: React.ReactNode; footnote: React.ReactNode }) {
  const inBrowser = useInBrowser()
  const load = React.useCallback(async () => ({ rows: schedule, total: schedule.length }), [schedule])
  const list = useAdminList({ initial: { rows: schedule, total: schedule.length }, initialPageSize: 100, page: 1, onPageChange: () => {}, load })
  const rowIds = list.rows.map((hour) => hour.startsAt)
  const starts = schedule.reduce((sum, hour) => sum + hour.focusing.length, 0)
  return (
    <AdminListTable
      noun="hours"
      emptyText="Nothing is planned in the next 24 hours."
      columns={[
        { key: "hour", label: "Hour", column: "main", sortable: false },
        { key: "focusing", label: "Starting a focus", column: "meta", sortable: false },
        { key: "rooms", label: "Rooms opening", column: "meta", sortable: false, className: "hidden md:hidden @3xl:table-cell" },
      ]}
      sort="hour"
      direction="asc"
      onSort={() => {}}
      list={list}
      page={1}
      onPageChange={() => {}}
      search={null}
      view={view}
      footnote={
        <>
          {footnote}
          <span className="mt-1 block">
            {starts} {plural(starts, "focus start", "focus starts")} in the next 24 hours, counting each person once an hour. Rooms opened to keep
            Open to join full are not foreseen.
          </span>
        </>
      }
      rowIds={rowIds}
      record={{
        label: "Hour",
        content: (openId) => {
          const hour = list.rows.find((each) => each.startsAt === openId)
          if (!hour) return <NoRecord title="Hour" icon={<CalendarClockIcon aria-hidden />} line="Nothing is planned in the next 24 hours." />
          return (
            <DetailRecord
              key={hour.startsAt}
              icon={<CalendarClockIcon aria-hidden />}
              title={inBrowser ? formatClockTime(hour.startsAt) : "-"}
              line={`${hour.focusing.length} ${plural(hour.focusing.length, "focus start", "focus starts")}, ${hour.rooms.length} ${plural(hour.rooms.length, "room", "rooms")}`}
              hideLabel="Hide the hour"
              facts={[
                ["Starting a focus", hour.focusing.length.toLocaleString()],
                ["Rooms opening", hour.rooms.length.toLocaleString()],
              ]}
            >
              <PanelCard storageId="pomodoro-flowfly-madeup-hour" icon={<BotIcon />} title="Who and where">
                <ul className="grid gap-1.5 text-sm">
                  {hour.focusing.map((person) => (
                    <li key={person.name} className="truncate">
                      {person.name}
                    </li>
                  ))}
                  {hour.rooms.map((room) => (
                    <li key={`${room.name}-${room.host}`} className="truncate text-muted-foreground">
                      {room.name}
                      {room.weekly ? ", weekly" : ""} ({room.host})
                    </li>
                  ))}
                </ul>
              </PanelCard>
            </DetailRecord>
          )
        },
      }}
    >
      {list.rows.map((hour) => (
        <AdminRow key={hour.startsAt} id={hour.startsAt} label={`the hour at ${inBrowser ? formatClockTime(hour.startsAt) : "-"}`}>
          <MainCell name={inBrowser ? formatClockTime(hour.startsAt) : "-"} />
          <TableCell column="meta">
            <span className="block max-w-xl truncate">
              {hour.focusing.length ? `${hour.focusing.length}: ${hour.focusing.map((person) => person.name).join(", ")}` : "-"}
            </span>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @3xl:table-cell">
            <span className="block max-w-72 truncate">
              {hour.rooms.length ? hour.rooms.map((room) => `${room.name}${room.weekly ? ", weekly" : ""}`).join("; ") : "-"}
            </span>
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}

function localTime(timezone: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date())
  } catch {
    return "-"
  }
}

const KIND_LABELS: Record<string, string> = {
  open: "Room opens",
  focus: "Before a focus",
  break: "Break starts",
  greet: "Hello to somebody real",
  reply: "Reply",
  mention: "Answer to an @",
  exchange: "Break chat",
  leave: "Goodbye",
  arrive: "Hello in a real room",
  welcome: "Hello back to somebody real",
  ask: "Question after a hello",
  reaction: "Reaction",
}

/**
 * Every line attempt, newest first, kept 30 days. A line opens on the right
 * with the brief the AI was sent, so a bad line is traced to the setting
 * that produced it. Its own page number in the address (`lines`).
 */
function LinesList({
  initial,
  initialPageSize,
  view,
  footnote,
}: {
  initial: { rows: SimulatedLineRow[]; total: number }
  initialPageSize: number
  view: React.ReactNode
  footnote: React.ReactNode
}) {
  const search = useFlowflySearch<MadeupSearch>()
  const setListSearch = useListSearchNavigate()
  const page = search.lines ?? 1
  const inBrowser = useInBrowser()
  const setPage = React.useCallback((next: number) => setListSearch({ lines: next > 1 ? next : undefined }), [setListSearch])
  const load = React.useCallback((pageSize: number) => listSimulatedLineRows({ page, pageSize }), [page])
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const rowIds = list.rows.map((row) => row.id)
  const said = (row: SimulatedLineRow) => row.body ?? (row.source === "ai" ? "No line came back" : "Nothing passed the checks")

  return (
    <AdminListTable
      noun="lines"
      emptyText="No lines yet. The rooms stay quiet until Preview has been pressed on the voice card."
      columns={[
        { key: "line", label: "Line", column: "main", sortable: false },
        { key: "who", label: "Who", column: "meta", sortable: false, className: "hidden md:hidden @xl:table-cell" },
        { key: "when", label: "When", column: "meta", sortable: false, className: "hidden md:hidden @3xl:table-cell" },
        { key: "cost", label: "Cost", column: "meta", sortable: false },
      ]}
      sort="when"
      direction="desc"
      onSort={() => {}}
      list={list}
      page={page}
      onPageChange={setPage}
      search={null}
      view={view}
      footnote={footnote}
      rowIds={rowIds}
      record={{
        label: "Line",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Line" icon={<MessageSquareTextIcon aria-hidden />} line="No lines yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<MessageSquareTextIcon aria-hidden />}
              title={said(row)}
              line={`${row.name} · ${row.roomName ?? "A closed room"}`}
              hideLabel="Hide the line"
              facts={[
                ["Who", <MemberName key="who" id={row.userId} name={row.name} />],
                ["Room", row.roomName ?? "A closed room"],
                ["When", inBrowser ? formatDateTime(row.createdAt) : "-"],
                ["What for", KIND_LABELS[row.kind] ?? row.kind],
                ["Source", row.source === "ai" ? (row.model ?? "AI") : "Fixed line"],
                ["Cost", formatCents(row.costCents)],
                ["Sent", row.sent ? "Yes" : row.rejectedReason ? `No: ${row.rejectedReason}` : "No"],
              ]}
              state={row.sent ? "Sent to the room" : "Not sent"}
            >
              <PanelCard storageId="pomodoro-flowfly-madeup-brief" icon={<BotIcon />} title="The brief">
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{row.brief ?? "A fixed line: no brief was sent."}</p>
              </PanelCard>
            </DetailRecord>
          )
        },
      }}
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={`the line from ${row.name}`}>
          <MainCell name={said(row)}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {KIND_LABELS[row.kind] ?? row.kind}
              {row.sent ? "" : row.rejectedReason ? `, not sent: ${row.rejectedReason}` : ", not sent"}
            </span>
          </MainCell>
          <TableCell column="meta" className="hidden md:hidden @xl:table-cell">
            <MemberName id={row.userId} name={row.name} className="max-w-40" />
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
            {inBrowser ? formatDateTime(row.createdAt) : "-"}
          </TableCell>
          <TableCell column="meta">{formatCents(row.costCents)}</TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
