import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { AwardIcon, UndoIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
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
  listPomodoroAchievements,
  revokePomodoroAchievements,
  type AdminAchievementRow,
} from "@/lib/api/pomodoro/admin-achievements"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import { ACHIEVEMENTS, findAchievement } from "@/lib/pomodoro/achievements"
import type { AchievementSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-achievements")

type SortColumn = AchievementSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "person", label: "Member", column: "main" },
  { key: "badge", label: "Badge", column: "meta" },
  { key: "earned", label: "Earned", column: "meta" },
]

/**
 * Who earned which badge, and Revoke (admin task 06, part 10). A revoked
 * badge leaves the member's badges and pinned badges and is never awarded
 * again. The member is not told. See `workspace/docs/achievements.md`.
 */
export function AdminAchievementsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminAchievementRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const badgeId = search.badge
  const userId = search.user
  const sort: SortColumn = search.sort ?? "earned"
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
    (pageSize: number) =>
      listPomodoroAchievements({ search: query, badgeId, userId, sort, direction, page, pageSize }),
    [badgeId, direction, page, query, sort, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "earned" ? "desc" : "asc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  // Whose badges these are, taken off the first row: every row the filter
  // can return belongs to them.
  const filteredMemberName = userId ? (list.rows[0]?.name ?? null) : null

  const revoke = useAdminDelete({
    one: "badge",
    many: "badges",
    run: async (ids) => {
      const { changed, skipped } = await revokePomodoroAchievements(ids)
      return { deleted: changed, skipped }
    },
    verb: "revoked",
    keptReason: "already revoked",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => revoke.ids.includes(row.id))

  return (
    <>
      <AdminListTable
        title="Achievements"
        icon={<AwardIcon />}
        noun="badges"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "badges", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton
              del={revoke}
              ids={selectedIds}
              label="Revoke"
              icon={<UndoIcon className="size-4" />}
            />
            {userId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => setListSearch({ user: undefined, page: undefined })}
              >
                <XIcon className="size-4" />
                {filteredMemberName ? `Only ${filteredMemberName}` : "One member only"}
              </Button>
            ) : null}
            <DashboardToolbarSearch
              name="achievement-search"
              aria-label="Search badges"
              placeholder="Search name or email…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={badgeId ?? "all"}
              onValueChange={(value) =>
                setListSearch({ badge: value === "all" ? undefined : value, page: undefined })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by badge">
                <SelectValue placeholder="Badge" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every badge</SelectItem>
                {ACHIEVEMENTS.map((badge) => (
                  <SelectItem key={badge.id} value={badge.id}>
                    {badge.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      >
        {list.rows.map((row) => {
          const badgeName = findAchievement(row.badgeId)?.name ?? row.badgeId
          return (
            <TableRow key={row.id}>
              <AdminSelectCell
                selection={selection}
                id={row.id}
                label={`Select ${row.name}'s ${badgeName} badge`}
              />
              <TableCell column="main">
                <div className="min-w-0">
                  <MemberName id={row.userId} name={row.name} />
                  <span className="block max-w-96 truncate text-xs text-muted-foreground" title={row.email}>
                    {row.email}
                  </span>
                </div>
              </TableCell>
              <TableCell column="meta">{badgeName}</TableCell>
              <TableCell column="mutedMeta">{formatDateTime(row.earnedAt)}</TableCell>
              <TableCell column="actions">
                <AdminRowDeleteButton
                  del={revoke}
                  id={row.id}
                  label={`Revoke ${row.name}'s ${badgeName} badge`}
                  icon={<UndoIcon className="size-4" />}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </AdminListTable>
      <AdminDeleteConfirm
        del={revoke}
        title={
          asked.length === 1
            ? `Revoke ${asked[0].name}'s ${findAchievement(asked[0].badgeId)?.name ?? "badge"} badge?`
            : `Revoke ${revoke.ids.length} ${plural(revoke.ids.length, "badge", "badges")}?`
        }
        description="It leaves their badges and their public page, and comes off their pinned badges. They will not earn it again, even when they reach it a second time. Nobody is told. This cannot be undone."
        confirmLabel="Revoke"
      />
    </>
  )
}
