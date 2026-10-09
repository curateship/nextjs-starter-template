import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { BarChart3Icon, ShieldOffIcon, UserXIcon, XIcon } from "lucide-react"

import { TableCell, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardCardHeaderIcon } from "@/components/shared/dashboard-card-header"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  listPomodoroBlocks,
  type AdminBlockRow,
  type AdminMostBlockedRow,
} from "@/lib/api/pomodoro/admin-social"
import { formatDateTime } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { BlockTab } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-blocks")

type BlocksList =
  | { tab: "blocks"; rows: AdminBlockRow[]; total: number }
  | { tab: "most"; rows: AdminMostBlockedRow[]; total: number }
type BlocksRow = AdminBlockRow | AdminMostBlockedRow

const TABS: Record<BlockTab, { label: string; icon: React.ReactNode; noun: string }> = {
  blocks: { label: "Every block", icon: <UserXIcon />, noun: "blocks" },
  most: { label: "Most blocked", icon: <BarChart3Icon />, noun: "blocked accounts" },
}

// Neither view sorts: every block reads newest first, and "most blocked" is
// its own order, so one fixed key stands in for the header's sort.
type Column = "fixed"
const BLOCK_COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "blocker", label: "Who blocked", column: "main", sortable: false },
  { key: "blocked", label: "Whom", column: "meta", sortable: false },
  { key: "created", label: "When", column: "meta", sortable: false },
]
const MOST_COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "blocked", label: "Account", column: "main", sortable: false },
  { key: "count", label: "Blocked by", column: "meta", sortable: false },
  { key: "last", label: "Last blocked", column: "meta", sortable: false },
]

/**
 * Who blocked whom (admin task 06, part 9), and the accounts blocked the
 * most. Read-only on purpose: a block is a private choice between members,
 * so there is nothing to tick and nothing to undo. See
 * `workspace/docs/admin-members.md`.
 */
export function AdminBlocksDashboard({
  initial,
  initialPageSize,
}: {
  initial: BlocksList
  initialPageSize: number
}) {
  const search = route.useSearch()
  const tab: BlockTab = search.tab ?? "blocks"
  const setListSearch = useListSearchNavigate()
  return (
    <BlocksTable
      key={initial.tab}
      tab={initial.tab}
      initial={initial}
      initialPageSize={initialPageSize}
      tabs={
        <Tabs
          value={tab}
          onValueChange={(value) => setListSearch({ tab: value === "blocks" ? undefined : value, page: undefined })}
        >
          <TabsList>
            {(Object.keys(TABS) as BlockTab[]).map((value) => (
              <TabsTrigger key={value} value={value} className="group/blocks-tab">
                <DashboardCardHeaderIcon className="group-data-[state=active]/blocks-tab:text-foreground">
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

function BlocksTable({
  tab,
  initial,
  initialPageSize,
  tabs,
}: {
  tab: BlockTab
  initial: { rows: BlocksRow[]; total: number }
  initialPageSize: number
  tabs: React.ReactNode
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const userId = search.user
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
      const result = await listPomodoroBlocks({ tab, search: query, user: userId, page, pageSize })
      return { rows: result.rows as BlocksRow[], total: result.total }
    },
    [page, query, tab, userId]
  )
  const list = useAdminList<BlocksRow>({ initial, initialPageSize, page, onPageChange: setPage, load })
  const filteredName = userId ? personName(list.rows, userId) : null

  return (
    <AdminListTable
      title="Blocks"
      icon={<ShieldOffIcon />}
      tabs={tabs}
      noun={TABS[tab].noun}
      columns={tab === "most" ? MOST_COLUMNS : BLOCK_COLUMNS}
      sort="fixed"
      direction="desc"
      onSort={() => {}}
      list={list}
      page={page}
      onPageChange={setPage}
      controls={
        <>
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
            name="blocks-search"
            aria-label={`Search ${TABS[tab].noun}`}
            placeholder={tab === "most" ? "Search name or email…" : "Search either person's name or email…"}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </>
      }
    >
      {list.rows.map((row) =>
        "blockerId" in row ? (
          <TableRow key={row.id}>
            <TableCell column="main">
              <MemberName id={row.blockerId} name={row.blockerName} />
              <span className="block max-w-96 truncate text-xs text-muted-foreground">{row.blockerEmail}</span>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <MemberName id={row.blockedId} name={row.blockedName} className="max-w-56" />
            </TableCell>
            <TableCell column="mutedMeta">{formatDateTime(row.createdAt)}</TableCell>
          </TableRow>
        ) : (
          <TableRow key={row.id}>
            <TableCell column="main">
              <MemberName id={row.id} name={row.name} />
              <span className="block max-w-96 truncate text-xs text-muted-foreground">{row.email}</span>
            </TableCell>
            <TableCell column="meta">
              {row.blocks.toLocaleString()} {row.blocks === 1 ? "person" : "people"}
            </TableCell>
            <TableCell column="mutedMeta">{formatDateTime(row.lastBlockedAt)}</TableCell>
          </TableRow>
        )
      )}
    </AdminListTable>
  )
}

/** The filtered person's name, read off whichever side of a row they are on. */
function personName(rows: BlocksRow[], userId: string) {
  for (const row of rows) {
    if ("blockerId" in row) {
      if (row.blockerId === userId) return row.blockerName
      if (row.blockedId === userId) return row.blockedName
    } else if (row.id === userId) return row.name
  }
  return null
}
