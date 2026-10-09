import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { BanIcon, EyeOffIcon, ShieldAlertIcon, UndoIcon } from "lucide-react"

import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardCardHeaderIcon } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminListTable,
  AdminSelectCell,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import {
  liftPomodoroSafety,
  listPomodoroSafety,
  type AdminHiddenProfileRow,
  type AdminRoomBanRow,
  type AdminSuspensionRow,
} from "@/lib/api/pomodoro/admin-safety"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import type { SafetyTab } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-bans")

type SafetyList =
  | { tab: "bans"; rows: AdminRoomBanRow[]; total: number }
  | { tab: "hidden"; rows: AdminHiddenProfileRow[]; total: number }
  | { tab: "suspensions"; rows: AdminSuspensionRow[]; total: number }
type SafetyRow = AdminRoomBanRow | AdminHiddenProfileRow | AdminSuspensionRow

const TABS: Record<SafetyTab, { label: string; icon: React.ReactNode; noun: [string, string]; lift: string }> = {
  bans: {
    label: "Room bans",
    icon: <BanIcon />,
    noun: ["room ban", "room bans"],
    lift: "They can join that room again. Nobody is told.",
  },
  hidden: {
    label: "Hidden profiles",
    icon: <EyeOffIcon />,
    noun: ["hidden profile", "hidden profiles"],
    lift: "Their public page reads again at once, and each owner is told in the bell.",
  },
  suspensions: {
    label: "Suspensions",
    icon: <ShieldAlertIcon />,
    noun: ["suspension", "suspensions"],
    lift: "They can join, open and chat in rooms again at once. Nobody is told.",
  },
}

type Column = "who"
const COLUMNS: TableHeaderColumn<Column>[] = [{ key: "who", label: "Who", column: "main", sortable: false }]

/**
 * Room bans, hidden profiles and suspensions in one place (admin task 05),
 * each with Lift on its row and over ticked rows. Suspensions show only while
 * they run; one ends by itself on its date. See
 * `workspace/docs/admin-safety-tools.md`.
 */
export function AdminSafetyDashboard({
  initial,
  initialPageSize,
}: {
  initial: SafetyList
  initialPageSize: number
}) {
  const search = route.useSearch()
  const tab: SafetyTab = search.tab ?? "bans"
  const setListSearch = useListSearchNavigate()
  return (
    <SafetyTable
      key={initial.tab}
      tab={initial.tab}
      initial={initial}
      initialPageSize={initialPageSize}
      tabs={
        <Tabs
          value={tab}
          onValueChange={(value) => setListSearch({ tab: value === "bans" ? undefined : value, page: undefined })}
        >
          <TabsList>
            {(Object.keys(TABS) as SafetyTab[]).map((value) => (
              <TabsTrigger key={value} value={value} className="group/safety-tab">
                <DashboardCardHeaderIcon className="group-data-[state=active]/safety-tab:text-foreground">
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

function SafetyTable({
  tab,
  initial,
  initialPageSize,
  tabs,
}: {
  tab: SafetyTab
  initial: { rows: SafetyRow[]; total: number }
  initialPageSize: number
  tabs: React.ReactNode
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
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
      const result = await listPomodoroSafety({ tab, search: query, page, pageSize })
      return { rows: result.rows as SafetyRow[], total: result.total }
    },
    [page, query, tab]
  )
  const list = useAdminList<SafetyRow>({ initial, initialPageSize, page, onPageChange: setPage, load })
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const [one, many] = TABS[tab].noun
  const lift = useAdminDelete({
    one,
    many,
    run: async (ids) => {
      const { changed, skipped } = await liftPomodoroSafety(tab, ids)
      return { deleted: changed, skipped }
    },
    verb: "lifted",
    keptReason: "already lifted",
    selection,
    onDone: list.refresh,
  })

  return (
    <>
      <AdminListTable
        title="Bans"
        icon={<BanIcon />}
        tabs={tabs}
        noun={many}
        columns={COLUMNS}
        sort="who"
        direction="desc"
        onSort={() => {}}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: many, rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={lift} ids={selectedIds} label="Lift" icon={<UndoIcon className="size-4" />} />
            <DashboardToolbarSearch
              name="safety-search"
              aria-label={`Search ${many}`}
              placeholder={tab === "bans" ? "Search name, email or room…" : "Search name or email…"}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.id}>
            <AdminSelectCell selection={selection} id={row.id} label={`Select ${row.name}`} />
            <TableCell column="main">
              <MemberName id={"userId" in row ? row.userId : row.id} name={row.name} title={row.email} className="max-w-[36rem]" />
              <span className="block max-w-[36rem] truncate text-xs text-muted-foreground">
                <RowDetail row={row} />
              </span>
            </TableCell>
            <TableCell column="actions">
              <AdminRowDeleteButton
                del={lift}
                id={row.id}
                label={`Lift the ${one} for ${row.name}`}
                icon={<UndoIcon className="size-4" />}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={lift}
        title={`Lift ${lift.ids.length} ${plural(lift.ids.length, one, many)}?`}
        description={TABS[tab].lift}
        confirmLabel="Lift"
      />
    </>
  )
}

/** What each kind of row says under the name. */
function RowDetail({ row }: { row: SafetyRow }) {
  if ("roomName" in row) {
    return (
      <>
        Banned from {row.roomName} by {row.bannedByName} · {formatDateTime(row.createdAt)}
      </>
    )
  }
  if ("hiddenAt" in row) {
    return (
      <>
        {row.handle ? `/u/${row.handle}` : "No address"} · hidden {row.hiddenAt ? formatDateTime(row.hiddenAt) : ""}
        {row.reportReason ? ` · reported for "${row.reportReason}"` : ""}
      </>
    )
  }
  return (
    <>
      {row.endsAt ? `Until ${formatDate(row.endsAt)}` : "Until lifted"} · {row.reason}
      {row.suspendedByName ? ` · by ${row.suspendedByName}` : ""}
    </>
  )
}
