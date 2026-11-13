import * as React from "react"
import { ShieldOffIcon, UserXIcon } from "lucide-react"

import { TableCell } from "@/components/ui/table"
import { ViewMenu } from "@/components/shared/view-menu"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminMemberRecord } from "@/components/pomodoro/admin-member-record"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { listPomodoroBlocks, type AdminBlockRow, type AdminMostBlockedRow } from "@/lib/api/pomodoro/admin-social"
import { formatDateTime } from "@/lib/format/format-time"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import type { BlockTab } from "@/lib/pomodoro/admin-lists"

type BlocksList =
  | { tab: "blocks"; rows: AdminBlockRow[]; total: number }
  | { tab: "most"; rows: AdminMostBlockedRow[]; total: number }
type BlocksRow = AdminBlockRow | AdminMostBlockedRow

type BlocksSearch = { q?: string; tab?: BlockTab; user?: string; page?: number }

const VIEWS: Record<BlockTab, { label: string; noun: string }> = {
  blocks: { label: "Every block", noun: "blocks" },
  most: { label: "Most blocked", noun: "blocked accounts" },
}

// Neither view sorts: every block reads newest first, and "most blocked" is
// its own order, so one fixed key stands in for the header's sort.
type Column = "fixed"
const BLOCK_COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "blocker", label: "Who blocked", column: "main", sortable: false },
  { key: "blocked", label: "Whom", column: "meta", sortable: false },
  { key: "created", label: "When", column: "meta", sortable: false, className: "hidden md:hidden @2xl:table-cell" },
]
const MOST_COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "blocked", label: "Account", column: "main", sortable: false },
  { key: "count", label: "Blocked by", column: "meta", sortable: false },
  { key: "last", label: "Last blocked", column: "meta", sortable: false, className: "hidden md:hidden @2xl:table-cell" },
]

/**
 * Safety → Blocks on the Flowfly dashboard: who blocked whom (admin task 06,
 * part 9), and the accounts blocked the most, the two picked in the
 * header's view dropdown (a tab's own choices are a dropdown, never a second
 * row). Read-only on purpose: a block is a private choice between members,
 * so there is nothing to tick and nothing to undo. A most-blocked account
 * opens the member on the right. See `workspace/docs/admin-members.md`.
 */
export function AdminBlocksDashboard({
  initial,
  initialPageSize,
}: {
  initial: BlocksList
  initialPageSize: number
}) {
  const tab: BlockTab = initial.tab
  const search = useFlowflySearch<BlocksSearch>()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const userId = search.user
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
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
  const rowIds = list.rows.map((row) => row.id)

  return (
    <AdminListTable
      noun={VIEWS[tab].noun}
      columns={tab === "most" ? MOST_COLUMNS : BLOCK_COLUMNS}
      sort="fixed"
      direction="desc"
      onSort={() => {}}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "blocks-search",
        label: `Search ${VIEWS[tab].noun}`,
        placeholder: tab === "most" ? "Search name or email" : "Search either person",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredName, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
      view={
        <ViewMenu
          label="Which blocks"
          value={tab}
          onValueChange={(value) => setListSearch({ tab: value === "blocks" ? undefined : value, page: undefined, open: undefined })}
          choices={(Object.keys(VIEWS) as BlockTab[]).map((value) => ({ value, label: VIEWS[value].label }))}
        />
      }
      rowIds={rowIds}
      record={{
        label: tab === "most" ? "Member" : "Block",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Block" icon={<ShieldOffIcon aria-hidden />} line="Nobody has blocked anyone." />
          if (!("blockerId" in row)) return <AdminMemberRecord key={row.id} userId={row.id} />
          return (
            <DetailRecord
              key={row.id}
              icon={<UserXIcon aria-hidden />}
              title={`${row.blockerName} blocked ${row.blockedName}`}
              line={formatDateTime(row.createdAt)}
              hideLabel="Hide the block"
              facts={[
                ["Who blocked", <MemberName key="from" id={row.blockerId} name={row.blockerName} title={row.blockerEmail} />],
                ["Whom", <MemberName key="to" id={row.blockedId} name={row.blockedName} />],
                ["When", formatDateTime(row.createdAt)],
              ]}
              state="A private choice between members: nothing to undo here."
            />
          )
        },
      }}
    >
      {list.rows.map((row) =>
        "blockerId" in row ? (
          <AdminRow key={row.id} id={row.id} label={`${row.blockerName} blocking ${row.blockedName}`}>
            <MainCell name={row.blockerName} avatar={{ name: row.blockerName, email: row.blockerEmail }} />
            <TableCell column="meta" className="max-w-56">
              <MemberName id={row.blockedId} name={row.blockedName} className="max-w-56" />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
          </AdminRow>
        ) : (
          <AdminRow key={row.id} id={row.id} label={row.name}>
            <MainCell name={row.name} avatar={{ name: row.name, email: row.email }} />
            <TableCell column="meta">
              {row.blocks.toLocaleString()} {row.blocks === 1 ? "person" : "people"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {formatDateTime(row.lastBlockedAt)}
            </TableCell>
          </AdminRow>
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
