import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { CalendarClockIcon, MessageSquareTextIcon, PauseIcon, PlayIcon, SettingsIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { SortableTableHeader, type TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, AdminSelectCell, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName, useMemberWindowLink } from "@/components/pomodoro/admin-member-name"
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
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatClockTime, formatDateTime, formatDuration } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import type { SimulatedSort, SimulatedTab } from "@/lib/pomodoro/admin-lists"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The watch page for the made-up members, `/admin/pomodoro-simulated` (live
 * activity task 05, Parts 2 to 4): one line saying what they did today and
 * what the chat cost, today's schedule before it runs, every account with its
 * pause switch, and every line they said with the brief behind it. See "Your
 * controls" in `workspace/docs/made-up-members.md`.
 */

const route = getRouteApi("/_authenticated/admin/pomodoro-simulated")

type WatchPage = {
  list: { rows: SimulatedWatchRow[]; total: number }
  lines: { rows: SimulatedLineRow[]; total: number }
  summary: SimulatedSummary
  schedule: ScheduleHour[]
  pageSize: number
}

/** The summary and the schedule are read again this often while the page is open. */
const OVERVIEW_REFRESH_MS = 60_000

export function AdminSimulatedDashboard({ initial }: { initial: WatchPage }) {
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

  return (
    <CardGroup>
      <ScheduleTable summary={overview.summary} schedule={overview.schedule} />
      <AccountsTable initial={initial.list} initialPageSize={initial.pageSize} onChanged={refreshOverview} />
      <LinesTable initial={initial.lines} initialPageSize={initial.pageSize} />
    </CardGroup>
  )
}

// ---------------------------------------------------------------------------
// The summary and today's schedule
// ---------------------------------------------------------------------------

/** Cents with the fractions kept while under one, since a line costs about a twentieth of one. */
function formatCents(cents: number) {
  if (cents === 0) return "0¢"
  return cents < 1 ? `${cents.toFixed(2)}¢` : `${Math.round(cents)}¢`
}

function SummaryLine({ summary }: { summary: SimulatedSummary }) {
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
  const lastReal = summary.lastRealSeenAt ? formatDateTime(summary.lastRealSeenAt) : "never"
  return (
    <div className="grid gap-1 text-sm" aria-live="polite">
      <p>
        {summary.focusedToday} of {summary.total} focused today, {summary.roomsOpen}{" "}
        {plural(summary.roomsOpen, "made-up room", "made-up rooms")} open, {summary.linesToday}{" "}
        {plural(summary.linesToday, "line", "lines")} said for {formatCents(summary.centsToday)} of{" "}
        {formatCents(summary.capCents)} today (UTC)
        {summary.paused ? `, ${summary.paused} paused` : ""}.
      </p>
      <p className="text-muted-foreground">
        Somebody real was last on the site: {lastReal}.
        {summary.pausedAll ? " Pause everything is on." : ""}
        {off.length ? ` Switched off: ${off.join(", ")}.` : ""}
      </p>
    </div>
  )
}

function ScheduleTable({ summary, schedule }: { summary: SimulatedSummary; schedule: ScheduleHour[] }) {
  const starts = schedule.reduce((sum, hour) => sum + hour.focusing.length, 0)
  return (
    <DashboardTable
      title="Today's schedule"
      icon={<CalendarClockIcon />}
      count={starts}
      filters={<SummaryLine summary={summary} />}
      header={
        <SortableTableHeader<"hour" | "focusing" | "rooms">
          columns={[
            { key: "hour", label: "Hour", column: "meta", sortable: false },
            { key: "focusing", label: "Starting a focus", column: "main", sortable: false },
            { key: "rooms", label: "Rooms opening", column: "meta", sortable: false },
          ]}
          sort="hour"
          direction="asc"
          onSort={() => {}}
        />
      }
      isEmpty={schedule.length === 0}
      emptyText="Nothing is planned in the next 24 hours."
      emptyColSpan={3}
      footer={{
        type: "summary",
        count: starts,
        label: `${plural(starts, "focus start", "focus starts")} in the next 24 hours, in your own time. Rooms opened to keep Open to join full are not foreseen.`,
      }}
    >
      {schedule.map((hour) => (
        <TableRow key={hour.startsAt}>
          <TableCell column="meta">{formatClockTime(hour.startsAt)}</TableCell>
          <TableCell column="main">
            <span
              className="block max-w-xl truncate"
              title={hour.focusing.map((person) => person.name).join(", ")}
            >
              {hour.focusing.length
                ? `${hour.focusing.length}: ${hour.focusing.map((person) => person.name).join(", ")}`
                : "-"}
            </span>
          </TableCell>
          <TableCell column="meta">
            <span
              className="block max-w-72 truncate"
              title={hour.rooms.map((room) => `${room.name} (${room.host})`).join(", ")}
            >
              {hour.rooms.length
                ? hour.rooms.map((room) => `${room.name}${room.weekly ? ", weekly" : ""}`).join("; ")
                : "-"}
            </span>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

// ---------------------------------------------------------------------------
// The accounts
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<SimulatedTab, string> = { today: "Today", paused: "Paused", all: "All" }

const ACCOUNT_COLUMNS: TableHeaderColumn<SimulatedSort | "where" | "room" | "paused">[] = [
  { key: "name", label: "Member", column: "main" },
  { key: "where", label: "Local time", column: "meta", sortable: false, className: "hidden md:table-cell" },
  { key: "hours", label: "Today", column: "meta" },
  { key: "room", label: "Room", column: "meta", sortable: false, className: "hidden lg:table-cell" },
  { key: "lines", label: "Lines today", column: "meta" },
  { key: "paused", label: "Paused", column: "meta", sortable: false },
]

function localTime(timezone: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date())
  } catch {
    return "-"
  }
}

function AccountsTable({
  initial,
  initialPageSize,
  onChanged,
}: {
  initial: { rows: SimulatedWatchRow[]; total: number }
  initialPageSize: number
  onChanged: () => void
}) {
  const search = route.useSearch()
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
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    (pageSize: number) => listSimulatedWatchRows({ tab, search: query, sort, direction, page, pageSize }),
    [direction, page, query, sort, tab]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SimulatedSort>({ sort, direction }, (column) => (column === "name" ? "asc" : "desc"))
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.userId), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const openMember = useMemberWindowLink()
  const [busy, setBusy] = React.useState(false)

  const setPaused = async (ids: string[], paused: boolean) => {
    setBusy(true)
    try {
      const { changed, skipped } = await setSimulatedMembersPaused(ids, paused)
      toast.success(
        describeBulkResult({
          done: changed.length,
          kept: 0,
          same: skipped.length,
          one: "made-up member",
          many: "made-up members",
          verb: paused ? "paused" : "unpaused",
          keptReason: paused ? "already paused" : "already running",
        })
      )
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
      title="Made-up members"
      icon={<UsersIcon />}
      tabs={
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setListSearch({ tab: value === "today" ? undefined : value, page: undefined })
          }
        >
          <TabsList>
            {(Object.keys(TAB_LABELS) as SimulatedTab[]).map((value) => (
              <TabsTrigger key={value} value={value}>
                {TAB_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      noun="made-up members"
      emptyText={
        tab === "today"
          ? "None of them has focused, talked or sat in a room today yet."
          : tab === "paused"
            ? "Nobody is paused."
            : undefined
      }
      columns={ACCOUNT_COLUMNS}
      sort={sort}
      direction={direction}
      onSort={(column) => {
        if (column === "name" || column === "hours" || column === "lines") toggleSort(column)
      }}
      trailing={<TableHead column="meta">Actions</TableHead>}
      selection={{ noun: "made-up members", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      controls={
        <>
          {selectedIds.length ? (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void setPaused(selectedIds, true)}>
                <PauseIcon className="size-4" />
                Pause
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void setPaused(selectedIds, false)}>
                <PlayIcon className="size-4" />
                Unpause
              </Button>
            </>
          ) : null}
          <DashboardToolbarSearch
            name="simulated-search"
            aria-label="Search made-up members"
            placeholder="Search name or handle…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </>
      }
    >
      {list.rows.map((row) => (
        <TableRow key={row.userId}>
          <AdminSelectCell selection={selection} id={row.userId} label={`Select ${row.name}`} />
          <TableCell column="main">
            <div className="min-w-0">
              <MemberName id={row.userId} name={row.name} />
              <span className="block max-w-96 truncate text-xs text-muted-foreground">
                {row.handle ? `/u/${row.handle}` : "No handle"}
              </span>
            </div>
          </TableCell>
          <TableCell column="meta" className="hidden md:table-cell">
            <span className="block">{localTime(row.timezone)}</span>
            <span className="block max-w-40 truncate text-xs text-muted-foreground" title={row.timezone}>
              {row.timezone}
            </span>
          </TableCell>
          <TableCell column="meta">{formatDuration(row.todaySeconds * 1000, { zero: "-" })}</TableCell>
          <TableCell column="meta" className="hidden lg:table-cell">
            <span className="block max-w-48 truncate" title={row.roomName ?? undefined}>
              {row.roomName ?? "-"}
            </span>
          </TableCell>
          <TableCell column="meta">
            {row.linesToday ? `${row.linesToday} · ${formatCents(row.centsToday)}` : "-"}
          </TableCell>
          <TableCell column="meta">
            <Switch
              checked={Boolean(row.pausedAt)}
              disabled={busy}
              aria-label={row.pausedAt ? `Unpause ${row.name}` : `Pause ${row.name}`}
              onCheckedChange={(paused) => void setPaused([row.userId], paused)}
            />
          </TableCell>
          <TableCell column="actions">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Open ${row.name}`}
              onClick={() => openMember(row.userId)}
            >
              <SettingsIcon className="size-4" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </AdminListTable>
  )
}

// ---------------------------------------------------------------------------
// Every line
// ---------------------------------------------------------------------------

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
  reaction: "Reaction",
}

/**
 * Every line attempt, newest first, kept 30 days. A row opens to the brief
 * the AI was sent, so a bad line is traced to the setting that produced it.
 * Its own page number in the address (`lines`), apart from the accounts'.
 * Drawn with `DashboardTable` rather than `AdminListTable`, which brings a
 * member window of its own: the page already has one.
 */
function LinesTable({
  initial,
  initialPageSize,
}: {
  initial: { rows: SimulatedLineRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const page = search.lines ?? 1
  const [rows, setRows] = React.useState(initial.rows)
  const [total, setTotal] = React.useState(initial.total)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<string | null>(null)
  const shown = React.useRef({ page, pageSize })

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await listSimulatedLineRows({ page, pageSize })
      setRows(result.rows)
      setTotal(result.total)
      setError(null)
    } catch (failure) {
      setError(getSimulatedErrorMessage(failure))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    if (shown.current.page === page && shown.current.pageSize === pageSize) return
    shown.current = { page, pageSize }
    void refresh()
  }, [page, pageSize, refresh])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const setPage = (next: number) => setListSearch({ lines: next > 1 ? next : undefined })

  return (
    <DashboardTable
      title="Lines"
      icon={<MessageSquareTextIcon />}
      count={total}
      busy={loading}
      error={error ? { message: error, onRetry: () => void refresh() } : null}
      header={
        <SortableTableHeader<"when" | "who" | "line" | "source" | "cost">
          columns={[
            { key: "when", label: "When", column: "meta", sortable: false },
            { key: "who", label: "Who", column: "meta", sortable: false },
            { key: "line", label: "Line", column: "main", sortable: false },
            { key: "source", label: "Source", column: "meta", sortable: false, className: "hidden md:table-cell" },
            { key: "cost", label: "Cost", column: "meta", sortable: false },
          ]}
          sort="when"
          direction="desc"
          onSort={() => {}}
        />
      }
      isEmpty={rows.length === 0}
      emptyText="No lines yet. The rooms stay quiet until Preview has been pressed on the voice card."
      emptyColSpan={5}
      footer={{
        type: "pagination",
        page,
        pageSize,
        total,
        totalPages,
        onPageChange: setPage,
        onPageSizeChange: (next) => {
          setPage(1)
          setPageSize(next)
        },
      }}
    >
      {rows.map((row) => (
        <React.Fragment key={row.id}>
          <TableRow rowAction={() => setOpen(open === row.id ? null : row.id)}>
            <TableCell column="meta">{formatDateTime(row.createdAt)}</TableCell>
            <TableCell column="meta">
              <MemberName id={row.userId} name={row.name} className="max-w-40" />
              <span className="block max-w-40 truncate text-xs text-muted-foreground" title={row.roomName ?? undefined}>
                {row.roomName ?? "A closed room"}
              </span>
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-xl truncate text-left hover:underline"
                title={row.body ?? undefined}
                aria-expanded={open === row.id}
                onClick={() => setOpen(open === row.id ? null : row.id)}
              >
                {row.body ?? (row.source === "ai" ? "No line came back" : "Nothing passed the checks")}
              </button>
              <span className="block text-xs text-muted-foreground">
                {KIND_LABELS[row.kind] ?? row.kind}
                {row.sent ? "" : row.rejectedReason ? `, not sent: ${row.rejectedReason}` : ", not sent"}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {row.source === "ai" ? (row.model ?? "AI") : "Fixed line"}
            </TableCell>
            <TableCell column="meta">{formatCents(row.costCents)}</TableCell>
          </TableRow>
          {open === row.id ? (
            <TableRow>
              <TableCell colSpan={5} className="whitespace-pre-wrap text-xs text-muted-foreground">
                {row.brief ?? "A fixed line: no brief was sent."}
              </TableCell>
            </TableRow>
          ) : null}
        </React.Fragment>
      ))}
    </DashboardTable>
  )
}
