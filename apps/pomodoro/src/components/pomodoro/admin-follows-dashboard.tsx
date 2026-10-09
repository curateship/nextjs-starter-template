import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { HeartHandshakeIcon, PartyPopperIcon, UserPlusIcon, XIcon } from "lucide-react"

import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardCardHeaderIcon } from "@/components/shared/dashboard-card-header"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminListTable,
  AdminSelectCell,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  deletePomodoroFollows,
  listPomodoroFollows,
  type AdminCheerRow,
  type AdminFollowRow,
} from "@/lib/api/pomodoro/admin-social"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { FollowSortColumn, FollowTab } from "@/lib/pomodoro/admin-lists"
import { findCheer } from "@/lib/pomodoro/cheers"

const route = getRouteApi("/_authenticated/admin/pomodoro-follows")

type FollowsList =
  | { tab: "follows"; rows: AdminFollowRow[]; total: number }
  | { tab: "cheers"; rows: AdminCheerRow[]; total: number }
type FollowsRow = AdminFollowRow | AdminCheerRow

const TABS: Record<FollowTab, { label: string; icon: React.ReactNode; noun: [string, string] }> = {
  follows: { label: "Follows", icon: <UserPlusIcon />, noun: ["follow", "follows"] },
  cheers: { label: "Cheers", icon: <PartyPopperIcon />, noun: ["cheer", "cheers"] },
}

const FOLLOW_COLUMNS: TableHeaderColumn<FollowSortColumn>[] = [
  { key: "follower", label: "Follower", column: "main", sortable: false },
  { key: "followed", label: "Who they follow", column: "meta", sortable: false },
  { key: "most", label: "They follow in all", column: "meta" },
  { key: "created", label: "When", column: "meta", className: "hidden lg:table-cell" },
]

const CHEER_COLUMNS: TableHeaderColumn<FollowSortColumn>[] = [
  { key: "from", label: "From", column: "main", sortable: false },
  { key: "to", label: "To", column: "meta", sortable: false },
  { key: "cheer", label: "Cheer", column: "meta", sortable: false },
  { key: "created", label: "When", column: "meta", className: "hidden lg:table-cell" },
]

/**
 * Who follows whom and who cheered whom (admin task 06, part 8), with delete
 * on a row and over ticked rows. Nobody is told, the same as an unfollow. See
 * `workspace/docs/admin-members.md`.
 */
export function AdminFollowsDashboard({
  initial,
  initialPageSize,
}: {
  initial: FollowsList
  initialPageSize: number
}) {
  const search = route.useSearch()
  const tab: FollowTab = search.tab ?? "follows"
  const setListSearch = useListSearchNavigate()
  return (
    <FollowsTable
      key={initial.tab}
      tab={initial.tab}
      initial={initial}
      initialPageSize={initialPageSize}
      tabs={
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setListSearch({
              tab: value === "follows" ? undefined : value,
              sort: undefined,
              direction: undefined,
              page: undefined,
            })
          }
        >
          <TabsList>
            {(Object.keys(TABS) as FollowTab[]).map((value) => (
              <TabsTrigger key={value} value={value} className="group/follows-tab">
                <DashboardCardHeaderIcon className="group-data-[state=active]/follows-tab:text-foreground">
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

function FollowsTable({
  tab,
  initial,
  initialPageSize,
  tabs,
}: {
  tab: FollowTab
  initial: { rows: FollowsRow[]; total: number }
  initialPageSize: number
  tabs: React.ReactNode
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const userId = search.user
  // Cheers sort only by when.
  const sort: FollowSortColumn = tab === "cheers" ? "created" : (search.sort ?? "created")
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
    async (pageSize: number) => {
      const result = await listPomodoroFollows({ tab, search: query, user: userId, sort, direction, page, pageSize })
      return { rows: result.rows as FollowsRow[], total: result.total }
    },
    [direction, page, query, sort, tab, userId]
  )
  const list = useAdminList<FollowsRow>({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<FollowSortColumn>({ sort, direction }, () => "desc")
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const [one, many] = TABS[tab].noun
  const del = useAdminDelete({
    one,
    many,
    run: (ids) => deletePomodoroFollows(tab, ids),
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const filteredName = userId ? personName(list.rows, userId) : null

  return (
    <>
      <AdminListTable
        title="Follows"
        icon={<HeartHandshakeIcon />}
        tabs={tabs}
        noun={many}
        columns={tab === "cheers" ? CHEER_COLUMNS : FOLLOW_COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: many, rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            {userId ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => setListSearch({ user: undefined, page: undefined })}
              >
                <XIcon className="size-4" />
                {filteredName ? `Only ${filteredName}` : "One member only"}
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="follows-search"
              aria-label={`Search ${many}`}
              placeholder="Search either person's name or email…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </>
        }
      >
        {list.rows.map((row) =>
          "followerId" in row ? (
            <TableRow key={row.id}>
              <AdminSelectCell
                selection={selection}
                id={row.id}
                label={`Select ${row.followerName} following ${row.followedName}`}
              />
              <TableCell column="main">
                <MemberName id={row.followerId} name={row.followerName} />
                <span className="block max-w-96 truncate text-xs text-muted-foreground">{row.followerEmail}</span>
              </TableCell>
              <TableCell column="meta" className="max-w-56">
                <MemberName id={row.followedId} name={row.followedName} className="max-w-56" />
              </TableCell>
              <TableCell column="meta">{row.followerFollows.toLocaleString()}</TableCell>
              <TableCell column="mutedMeta" className="hidden lg:table-cell">
                {formatDateTime(row.createdAt)}
              </TableCell>
              <TableCell column="actions">
                <AdminRowDeleteButton
                  del={del}
                  id={row.id}
                  label={`Delete ${row.followerName} following ${row.followedName}`}
                />
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={row.id}>
              <AdminSelectCell
                selection={selection}
                id={row.id}
                label={`Select the cheer from ${row.fromName} to ${row.toName}`}
              />
              <TableCell column="main">
                <MemberName id={row.fromId} name={row.fromName} />
                <span className="block max-w-96 truncate text-xs text-muted-foreground">{row.fromEmail}</span>
              </TableCell>
              <TableCell column="meta" className="max-w-56">
                <MemberName id={row.toId} name={row.toName} className="max-w-56" />
              </TableCell>
              <TableCell column="meta">{findCheer(row.cheerId)?.label ?? row.cheerId}</TableCell>
              <TableCell column="mutedMeta" className="hidden lg:table-cell">
                {formatDateTime(row.createdAt)}
              </TableCell>
              <TableCell column="actions">
                <AdminRowDeleteButton
                  del={del}
                  id={row.id}
                  label={`Delete the cheer from ${row.fromName} to ${row.toName}`}
                />
              </TableCell>
            </TableRow>
          )
        )}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, one, many)}?`}
        description={
          tab === "cheers"
            ? "The cheers come off the record. The bell notice each one already sent stays, and nobody is told. This cannot be undone."
            : "They stop following, the same as an unfollow, and nobody is told. They can follow again. This cannot be undone."
        }
        confirmLabel={plural(del.ids.length, `Delete ${one}`, `Delete ${many}`)}
      />
    </>
  )
}

/** The filtered person's name, read off whichever side of a row they are on. */
function personName(rows: FollowsRow[], userId: string) {
  for (const row of rows) {
    if ("followerId" in row) {
      if (row.followerId === userId) return row.followerName
      if (row.followedId === userId) return row.followedName
    } else {
      if (row.fromId === userId) return row.fromName
      if (row.toId === userId) return row.toName
    }
  }
  return null
}
