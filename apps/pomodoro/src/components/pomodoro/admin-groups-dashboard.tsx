import * as React from "react"
import { Trash2Icon, UsersIcon, UsersRoundIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import {
  deletePomodoroGroups,
  getAdminSocialErrorMessage,
  listPomodoroGroups,
  loadPomodoroGroup,
  type AdminGroup,
  type AdminGroupRow,
} from "@/lib/api/pomodoro/admin-social"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { GroupSortColumn } from "@/lib/pomodoro/admin-lists"

type SortColumn = GroupSortColumn

type GroupsSearch = { q?: string; user?: string; sort?: SortColumn; direction?: "asc" | "desc"; page?: number }

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Group", column: "main" },
  { key: "owner", label: "Owner", column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "members", label: "Members", column: "meta" },
  { key: "created", label: "Made", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
]

/**
 * Social → Groups on the Flowfly dashboard: every private focus group
 * (admin task 06, part 11), who owns it, how many are in it, and deleting
 * it. A group opens on the right with its members, where its window used to
 * list them. Deleting tells everybody who was in it. See
 * `workspace/docs/admin-members.md`.
 */
export function AdminGroupsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminGroupRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<GroupsSearch>()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const userId = search.user
  const sort: SortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const selection = useSelection()
  const load = React.useCallback(
    (pageSize: number) => listPomodoroGroups({ search: query, user: userId, sort, direction, page, pageSize }),
    [direction, page, query, sort, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" || column === "owner" ? "asc" : "desc"
  )
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const del = useAdminDelete({
    one: "group",
    many: "groups",
    run: deletePomodoroGroups,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))
  const askedPeople = asked.reduce((sum, row) => sum + row.memberCount, 0)

  return (
    <AdminListTable
      noun="groups"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "groups", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "group-search",
        label: "Search groups",
        placeholder: "Search group or owner",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={
        userId
          ? {
              name: list.rows.find((row) => row.ownerId === userId)?.ownerName ?? null,
              onClear: () => setListSearch({ user: undefined, page: undefined }),
            }
          : undefined
      }
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
        label: "Group",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Group" icon={<UsersIcon aria-hidden />} line="Nobody has made a focus group yet." />
          return <GroupRecord key={row.id} row={row} onDelete={() => del.ask([row.id])} />
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={del}
          title={asked.length === 1 ? `Delete ${asked[0].name}?` : `Delete ${del.ids.length} ${plural(del.ids.length, "group", "groups")}?`}
          description={`${
            asked.length === del.ids.length
              ? `${askedPeople} ${plural(askedPeople, "person is", "people are")} in ${plural(del.ids.length, "it", "them")}, and each is told in the bell that the group was deleted.`
              : "Everybody in them is told in the bell that the group was deleted."
          } Their focus time and the global leaderboard are untouched. This cannot be undone.`}
          confirmLabel={plural(del.ids.length, "Delete group", "Delete groups")}
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={row.name} onDelete={() => del.ask([row.id])}>
          <MainCell name={row.name} />
          <TableCell column="meta" className="hidden max-w-56 md:hidden @lg:table-cell">
            <MemberName id={row.ownerId} name={row.ownerName} className="max-w-56" />
          </TableCell>
          <TableCell column="meta">{row.memberCount}</TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}

/** One group on the right: its owner and when it was made, then who is in it, owner first. */
function GroupRecord({ row, onDelete }: { row: AdminGroupRow; onDelete: () => void }) {
  const [loaded, setLoaded] = React.useState<AdminGroup | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadPomodoroGroup(row.id).then(
      (answer) => {
        if (live) setLoaded(answer)
      },
      (error) => {
        if (live) setLoadError(getAdminSocialErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [row.id, attempt])

  return (
    <DetailRecord
      icon={<UsersIcon aria-hidden />}
      title={row.name}
      line={`Owned by ${row.ownerName}`}
      hideLabel="Hide the group"
      facts={[
        ["Owner", <MemberName key="owner" id={row.ownerId} name={row.ownerName} />],
        ["Members", row.memberCount.toLocaleString()],
        ["Made", formatDate(row.createdAt)],
      ]}
      state={`${row.memberCount} ${plural(row.memberCount, "person", "people")}`}
      footer={
        <Button type="button" variant="outline" className="text-destructive" onClick={onDelete}>
          <Trash2Icon />
          Delete
        </Button>
      }
    >
      <PanelCard storageId="pomodoro-flowfly-group-members" icon={<UsersRoundIcon />} title="Members" meta="Owner first">
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setAttempt((count) => count + 1)
            }}
          />
        ) : !loaded ? (
          <LoadingRow label="Reading the members…" />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {loaded.members.map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <MemberName id={member.userId} name={member.name} className="text-sm" />
                  <span className="block truncate text-xs text-muted-foreground">
                    {member.userId === loaded.group.ownerId ? "Owner · " : ""}
                    {member.email}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">Joined {formatDate(member.joinedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </DetailRecord>
  )
}
