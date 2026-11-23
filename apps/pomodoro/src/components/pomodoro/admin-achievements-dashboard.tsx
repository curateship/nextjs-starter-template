import * as React from "react"
import { AwardIcon, UndoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import {
  listPomodoroAchievements,
  revokePomodoroAchievements,
  type AdminAchievementRow,
} from "@/lib/api/pomodoro/admin-achievements"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import { ACHIEVEMENTS, findAchievement } from "@/lib/pomodoro/achievements"
import type { AchievementSortColumn } from "@/lib/pomodoro/admin-lists"

type SortColumn = AchievementSortColumn

type BadgesSearch = {
  q?: string
  badge?: string
  user?: string
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "person", label: "Member", column: "main" },
  { key: "badge", label: "Badge", column: "meta" },
  { key: "earned", label: "Earned", column: "meta", className: "hidden md:hidden @lg:table-cell" },
]

/**
 * Members → Badges on the Flowfly dashboard: who earned which badge, and
 * Revoke (admin task 06, part 10). A revoked badge leaves the member's
 * badges and pinned badges and is never awarded again. The member is not
 * told. A badge opens on the right with what it is for. See
 * `workspace/docs/achievements.md`.
 */
export function AdminAchievementsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminAchievementRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<BadgesSearch>()
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
  const load = React.useCallback(
    (pageSize: number) => listPomodoroAchievements({ search: query, badgeId, userId, sort, direction, page, pageSize }),
    [badgeId, direction, page, query, sort, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) => (column === "earned" ? "desc" : "asc"))
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
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
  const badgeName = (row: AdminAchievementRow) => findAchievement(row.badgeId)?.name ?? row.badgeId

  return (
    <AdminListTable
      noun="badges"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "badges", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "achievement-search",
        label: "Search badges",
        placeholder: "Search name or email",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredMemberName, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
      filter={{
        count: badgeId ? 1 : 0,
        onClear: () => setListSearch({ badge: undefined, page: undefined }),
        children: (
          <FilterPick
            id="badges-badge"
            label="Badge"
            value={badgeId}
            any="Every badge"
            options={ACHIEVEMENTS.map((badge) => [badge.id, badge.name])}
            onChange={(next) => setListSearch({ badge: next, page: undefined })}
          />
        ),
      }}
      bulk={(ids, menu) => (
        <SelectedMenuRow
          className="text-destructive"
          onClick={() => {
            menu.close()
            revoke.ask(ids)
          }}
        >
          <UndoIcon className="size-4" />
          Revoke
        </SelectedMenuRow>
      )}
      bulkBusy={revoke.deleting}
      rowIds={rowIds}
      record={{
        label: "Badge",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Badge" icon={<AwardIcon aria-hidden />} line="Nobody has earned a badge yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<AwardIcon aria-hidden />}
              title={badgeName(row)}
              line={row.name}
              hideLabel="Hide the badge"
              facts={[
                ["Member", <MemberName key="member" id={row.userId} name={row.name} title={row.email} />],
                ["Badge", badgeName(row)],
                ["For", findAchievement(row.badgeId)?.description ?? "None"],
                ["Earned", formatDateTime(row.earnedAt)],
              ]}
              state={`Earned ${formatDateTime(row.earnedAt)}`}
              footer={
                <Button type="button" variant="outline" className="text-destructive" onClick={() => revoke.ask([row.id])}>
                  <UndoIcon />
                  Revoke
                </Button>
              }
            />
          )
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={revoke}
          title={
            asked.length === 1
              ? `Revoke ${asked[0].name}'s ${badgeName(asked[0])} badge?`
              : `Revoke ${revoke.ids.length} ${plural(revoke.ids.length, "badge", "badges")}?`
          }
          description="It leaves their badges and their public page, and comes off their pinned badges. They will not earn it again, even when they reach it a second time. Nobody is told. This cannot be undone."
          confirmLabel="Revoke"
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={`${row.name}'s ${badgeName(row)} badge`} onDelete={() => revoke.ask([row.id])}>
          <MainCell name={row.name} avatar={{ name: row.name, email: row.email }} />
          <TableCell column="meta">{badgeName(row)}</TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @lg:table-cell">
            {formatDateTime(row.earnedAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
