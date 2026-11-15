import * as React from "react"
import { PartyPopperIcon, Trash2Icon, UserPlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import {
  deletePomodoroFollows,
  listPomodoroFollows,
  type AdminCheerRow,
  type AdminFollowRow,
} from "@/lib/api/pomodoro/admin-social"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { FollowSortColumn, FollowTab } from "@/lib/pomodoro/admin-lists"
import { findCheer } from "@/lib/pomodoro/cheers"

type FollowsList =
  | { tab: "follows"; rows: AdminFollowRow[]; total: number }
  | { tab: "cheers"; rows: AdminCheerRow[]; total: number }
type FollowsRow = AdminFollowRow | AdminCheerRow

type FollowsSearch = { q?: string; user?: string; sort?: FollowSortColumn; direction?: "asc" | "desc"; page?: number }

const NOUNS: Record<FollowTab, [string, string]> = {
  follows: ["follow", "follows"],
  cheers: ["cheer", "cheers"],
}

const FOLLOW_COLUMNS: TableHeaderColumn<FollowSortColumn>[] = [
  { key: "follower", label: "Follower", column: "main", sortable: false },
  { key: "followed", label: "Who they follow", column: "meta", sortable: false, className: "hidden md:hidden @2xl:table-cell" },
  { key: "most", label: "They follow in all", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
  { key: "created", label: "When", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
]

const CHEER_COLUMNS: TableHeaderColumn<FollowSortColumn>[] = [
  { key: "from", label: "From", column: "main", sortable: false },
  { key: "to", label: "To", column: "meta", sortable: false, className: "hidden md:hidden @2xl:table-cell" },
  { key: "cheer", label: "Cheer", column: "meta", sortable: false, className: "hidden md:hidden @4xl:table-cell" },
  { key: "created", label: "When", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
]

/**
 * Social → Follows and Social → Cheers on the Flowfly dashboard (admin task
 * 06, part 8): who follows whom and who cheered whom, with delete on a row
 * and over ticked rows. The two were one page's two tabs; now each is a tab
 * of Social (Tyler, 13 Nov 2026). Nobody is told, the same as an unfollow.
 * A row opens on the right with both people. See
 * `workspace/docs/admin-members.md`.
 */
export function AdminFollowsDashboard({
  initial,
  initialPageSize,
  which,
}: {
  initial: FollowsList
  initialPageSize: number
  which: FollowTab
}) {
  const tab = which
  const search = useFlowflySearch<FollowsSearch>()
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
  const [one, many] = NOUNS[tab]
  const del = useAdminDelete({
    one,
    many,
    run: (ids) => deletePomodoroFollows(tab, ids),
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const filteredName = userId ? personName(list.rows, userId) : null
  const Icon = tab === "cheers" ? PartyPopperIcon : UserPlusIcon

  return (
    <AdminListTable
      noun={many}
      columns={tab === "cheers" ? CHEER_COLUMNS : FOLLOW_COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: many, rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "follows-search",
        label: `Search ${many}`,
        placeholder: "Search either person",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredName, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
      bulk={(ids, menu) => (
        <SelectedMenuRow
          className="text-destructive"
          onClick={() => {
            menu.close()
            del.ask(ids)
          }}
        >
          <Trash2Icon className="size-4" />
          Delete
        </SelectedMenuRow>
      )}
      bulkBusy={del.deleting}
      rowIds={rowIds}
      record={{
        label: tab === "cheers" ? "Cheer" : "Follow",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row)
            return (
              <NoRecord
                title={tab === "cheers" ? "Cheer" : "Follow"}
                icon={<Icon aria-hidden />}
                line={tab === "cheers" ? "Nobody has cheered anyone yet." : "Nobody follows anyone yet."}
              />
            )
          const deleteButton = (
            <Button type="button" variant="outline" className="text-destructive" onClick={() => del.ask([row.id])}>
              <Trash2Icon />
              Delete
            </Button>
          )
          return "followerId" in row ? (
            <DetailRecord
              key={row.id}
              icon={<UserPlusIcon aria-hidden />}
              title={`${row.followerName} follows ${row.followedName}`}
              line={formatDateTime(row.createdAt)}
              hideLabel="Hide the follow"
              facts={[
                ["Follower", <MemberName key="from" id={row.followerId} name={row.followerName} title={row.followerEmail} />],
                ["Follows", <MemberName key="to" id={row.followedId} name={row.followedName} />],
                ["They follow in all", row.followerFollows.toLocaleString()],
                ["When", formatDateTime(row.createdAt)],
              ]}
              footer={deleteButton}
            />
          ) : (
            <DetailRecord
              key={row.id}
              icon={<PartyPopperIcon aria-hidden />}
              title={`${row.fromName} cheered ${row.toName}`}
              line={formatDateTime(row.createdAt)}
              hideLabel="Hide the cheer"
              facts={[
                ["From", <MemberName key="from" id={row.fromId} name={row.fromName} title={row.fromEmail} />],
                ["To", <MemberName key="to" id={row.toId} name={row.toName} />],
                ["Cheer", findCheer(row.cheerId)?.label ?? row.cheerId],
                ["When", formatDateTime(row.createdAt)],
              ]}
              footer={deleteButton}
            />
          )
        },
      }}
      windows={
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
      }
    >
      {list.rows.map((row) =>
        "followerId" in row ? (
          <AdminRow
            key={row.id}
            id={row.id}
            label={`${row.followerName} following ${row.followedName}`}
            onDelete={() => del.ask([row.id])}
          >
            <MainCell name={row.followerName} avatar={{ name: row.followerName, email: row.followerEmail }} />
            <TableCell column="meta" className="hidden max-w-56 md:hidden @2xl:table-cell">
              <MemberName id={row.followedId} name={row.followedName} className="max-w-56" />
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
              {row.followerFollows.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @5xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
          </AdminRow>
        ) : (
          <AdminRow
            key={row.id}
            id={row.id}
            label={`the cheer from ${row.fromName} to ${row.toName}`}
            onDelete={() => del.ask([row.id])}
          >
            <MainCell name={row.fromName} avatar={{ name: row.fromName, email: row.fromEmail }} />
            <TableCell column="meta" className="hidden max-w-56 md:hidden @2xl:table-cell">
              <MemberName id={row.toId} name={row.toName} className="max-w-56" />
            </TableCell>
            <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
              {findCheer(row.cheerId)?.label ?? row.cheerId}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @5xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
          </AdminRow>
        )
      )}
    </AdminListTable>
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
