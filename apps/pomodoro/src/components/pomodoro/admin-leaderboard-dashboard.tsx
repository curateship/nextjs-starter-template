import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { EyeOffIcon, TrophyIcon, UndoIcon } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardCardHeaderIcon } from "@/components/shared/dashboard-card-header"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, AdminSelectCell, useAdminList } from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  listPomodoroLeaderboard,
  setPomodoroBoardHidden,
  type AdminBoardHiddenRow,
  type AdminBoardRow,
} from "@/lib/api/pomodoro/admin-leaderboard"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import type { LeaderboardTab } from "@/lib/pomodoro/admin-lists"
import {
  LEADERBOARD_WINDOW_LABELS,
  LEADERBOARD_WINDOWS,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"

const route = getRouteApi("/_authenticated/admin/pomodoro-leaderboard")

type LeaderboardList =
  | { tab: "board"; rows: AdminBoardRow[]; total: number }
  | { tab: "hidden"; rows: AdminBoardHiddenRow[]; total: number }

const TABS: Record<LeaderboardTab, { label: string; icon: React.ReactNode }> = {
  board: { label: "Board", icon: <TrophyIcon /> },
  hidden: { label: "Taken off", icon: <EyeOffIcon /> },
}

type Column = "place" | "who" | "sessions" | "focus" | "perDay"
const BOARD_COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "place", label: "#", column: "meta", sortable: false },
  { key: "who", label: "Member", column: "main", sortable: false },
  { key: "sessions", label: "Sessions", column: "meta", sortable: false },
  { key: "focus", label: "Focus time", column: "meta", sortable: false },
  { key: "perDay", label: "Hours a focus day", column: "meta", sortable: false },
]
const HIDDEN_COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "who", label: "Member", column: "main", sortable: false },
]

/**
 * The global board as members see it, with each person's hours a day, and
 * the people an admin took off it (admin task 06, part 6). Taking somebody off
 * keeps them off the global board and every group board until they are put
 * back; their profile stays as it was. See `workspace/docs/leaderboard.md`.
 */
export function AdminLeaderboardDashboard({
  initial,
  initialPageSize,
}: {
  initial: LeaderboardList
  initialPageSize: number
}) {
  const search = route.useSearch()
  const tab: LeaderboardTab = search.tab ?? "board"
  const setListSearch = useListSearchNavigate()
  return (
    <LeaderboardTable
      key={initial.tab}
      tab={initial.tab}
      initial={initial}
      initialPageSize={initialPageSize}
      tabs={
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setListSearch({ tab: value === "board" ? undefined : value, page: undefined, q: undefined })
          }
        >
          <TabsList>
            {(Object.keys(TABS) as LeaderboardTab[]).map((value) => (
              <TabsTrigger key={value} value={value} className="group/board-tab">
                <DashboardCardHeaderIcon className="group-data-[state=active]/board-tab:text-foreground">
                  {TABS[value].icon}
                </DashboardCardHeaderIcon>
                {TABS[value].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    />
  )
}

type Row = AdminBoardRow | AdminBoardHiddenRow

function LeaderboardTable({
  tab,
  initial,
  initialPageSize,
  tabs,
}: {
  tab: LeaderboardTab
  initial: { rows: Row[]; total: number }
  initialPageSize: number
  tabs: React.ReactNode
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const boardWindow: LeaderboardWindow = search.window ?? "week"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    async (pageSize: number) => {
      const result = await listPomodoroLeaderboard({ tab, window: boardWindow, search: query, page, pageSize })
      return { rows: result.rows as Row[], total: result.total }
    },
    [boardWindow, page, query, tab]
  )
  const list = useAdminList<Row>({ initial, initialPageSize, page, onPageChange: setPage, load })
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.userId), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const hiding = tab === "board"
  const change = useAdminDelete({
    one: "person",
    many: "people",
    run: async (ids) => {
      const { changed, skipped } = await setPomodoroBoardHidden(ids, hiding)
      return { deleted: changed, skipped }
    },
    verb: hiding ? "taken off the board" : "put back on the board",
    keptReason: hiding ? "already off" : "already back",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => change.ids.includes(row.userId))
  const actionLabel = hiding ? "Take off the board" : "Put back"
  const actionIcon = hiding ? <EyeOffIcon className="size-4" /> : <UndoIcon className="size-4" />

  return (
    <>
      <AdminListTable
        title="Leaderboard"
        icon={<TrophyIcon />}
        tabs={tabs}
        noun={hiding ? "people on the board" : "people taken off"}
        columns={hiding ? BOARD_COLUMNS : HIDDEN_COLUMNS}
        sort="who"
        direction="desc"
        onSort={() => {}}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "people", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={change} ids={selectedIds} label={actionLabel} icon={actionIcon} />
            {hiding ? (
              <Select
                value={boardWindow}
                onValueChange={(value) =>
                  setListSearch({ window: value === "week" ? undefined : value, page: undefined })
                }
              >
                <DashboardToolbarSelectTrigger aria-label="Which board">
                  <SelectValue />
                </DashboardToolbarSelectTrigger>
                <SelectContent>
                  {LEADERBOARD_WINDOWS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {LEADERBOARD_WINDOW_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <DashboardToolbarSearch
                name="board-hidden-search"
                aria-label="Search people taken off"
                placeholder="Search name, email or handle…"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            )}
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.userId}>
            <AdminSelectCell selection={selection} id={row.userId} label={`Select ${row.name}`} />
            {"place" in row ? <BoardCells row={row} /> : <HiddenCells row={row} />}
            <TableCell column="actions">
              <AdminRowDeleteButton
                del={change}
                id={row.userId}
                label={hiding ? `Take ${row.name} off the board` : `Put ${row.name} back on the board`}
                icon={actionIcon}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={change}
        title={
          hiding
            ? asked.length === 1
              ? `Take ${asked[0].name} off the board?`
              : `Take ${change.ids.length} ${plural(change.ids.length, "person", "people")} off the board?`
            : asked.length === 1
              ? `Put ${asked[0].name} back on the board?`
              : `Put ${change.ids.length} ${plural(change.ids.length, "person", "people")} back on the board?`
        }
        description={
          hiding
            ? "They stop showing on the global board and on every focus group's board until an admin puts them back. Their profile, their figures and their own setting stay as they are. They see \"You're not shown on the leaderboard\" in their Settings, and nobody else is told."
            : "They show on the global board again if their own setting is on, and on their groups' boards. Nobody is told."
        }
        confirmLabel={actionLabel}
      />
    </>
  )
}

function BoardCells({ row }: { row: AdminBoardRow }) {
  // Hours on the days they focused, not across the whole window, so a week
  // with one 23-hour day stands out rather than averaging to three.
  const perDay = row.focusDays ? row.focusSeconds / 3_600 / row.focusDays : 0
  return (
    <>
      <TableCell column="meta">{row.place}</TableCell>
      <TableCell column="main">
        <div className="min-w-0">
          <MemberName id={row.userId} name={row.name} />
          <span className="block max-w-96 truncate text-xs text-muted-foreground" title={row.email}>
            Shown as {row.publicDisplayName}
            {row.handle ? ` · /u/${row.handle}` : ""}
          </span>
        </div>
      </TableCell>
      <TableCell column="meta">{row.focusSessions.toLocaleString()}</TableCell>
      <TableCell column="meta">{formatDuration(row.focusSeconds * 1000, { zero: "—" })}</TableCell>
      <TableCell column="meta">
        {row.focusDays ? `${perDay.toFixed(1)}h over ${row.focusDays} ${plural(row.focusDays, "day", "days")}` : "—"}
      </TableCell>
    </>
  )
}

function HiddenCells({ row }: { row: AdminBoardHiddenRow }) {
  return (
    <TableCell column="main">
      <div className="min-w-0">
        <MemberName id={row.userId} name={row.name} />
        <span className="block max-w-[36rem] truncate text-xs text-muted-foreground" title={row.email}>
          Taken off {formatDateTime(row.hiddenAt)}
          {row.hiddenByName ? ` by ${row.hiddenByName}` : ""}
          {row.leaderboardOptIn ? "" : " · their own setting is off too"}
        </span>
      </div>
    </TableCell>
  )
}
