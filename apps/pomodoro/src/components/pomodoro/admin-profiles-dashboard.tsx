import * as React from "react"
import { EyeOffIcon, IdCardIcon } from "lucide-react"

import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { AdminMemberRecord } from "@/components/pomodoro/admin-member-record"
import { NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { hidePomodoroProfiles } from "@/lib/api/pomodoro/admin-members"
import { listPomodoroProfiles, type AdminProfileRow } from "@/lib/api/pomodoro/admin-profiles"
import { formatDateTime } from "@/lib/format/format-time"
import { formatFocusHours } from "@/lib/pomodoro/focus-hours"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { PROFILE_VISIBILITY_FILTERS, ProfileSortColumn } from "@/lib/pomodoro/admin-lists"

type SortColumn = ProfileSortColumn

type ProfilesSearch = {
  q?: string
  visibility?: (typeof PROFILE_VISIBILITY_FILTERS)[number]
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn | "page" | "board">[] = [
  { key: "name", label: "Member", column: "main" },
  { key: "handle", label: "Address", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "focus", label: "Focus time", column: "meta" },
  { key: "page", label: "Page", column: "meta", sortable: false, className: "hidden md:hidden @3xl:table-cell" },
  { key: "board", label: "Leaderboard", column: "meta", sortable: false, className: "hidden md:hidden @4xl:table-cell" },
  { key: "followers", label: "Followers", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
  { key: "updated", label: "Changed", column: "meta", className: "hidden md:hidden @6xl:table-cell" },
]

/**
 * Members → Profiles on the Flowfly dashboard: every public profile with a
 * handle (admin task 06, part 2), with each person's all-time focus time,
 * which took the place of the Focus and Leaderboard lists (Tyler, 13 Nov
 * 2026: "we dont need the focus and leaderboard tab ... instead on profile
 * table, add a focus time col instead"). A row opens the same member record their
 * name opens anywhere (Tyler's pick "One record per person"), whose ⋮ holds
 * the profile's handle, display name and bio, and Hide or Show, where the
 * profile window used to. See `workspace/docs/admin-members.md`.
 */
export function AdminProfilesDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminProfileRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<ProfilesSearch>()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const visibility = search.visibility ?? "all"
  const sort: SortColumn = search.sort ?? "updated"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const load = React.useCallback(
    (pageSize: number) => listPomodoroProfiles({ search: query, visibility, sort, direction, page, pageSize }),
    [direction, page, query, sort, visibility]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" || column === "handle" ? "asc" : "desc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.userId), [list.rows])
  const showing = (ids: string[]) => ids.filter((id) => !list.rows.find((row) => row.userId === id)?.hiddenAt)

  const hide = useAdminDelete({
    one: "profile",
    many: "profiles",
    run: async (ids) => {
      const { changed, skipped } = await hidePomodoroProfiles(ids)
      return { deleted: changed, skipped }
    },
    verb: "hidden",
    keptReason: "already hidden",
    selection,
    onDone: list.refresh,
  })
  const hiding = list.rows.filter((row) => hide.ids.includes(row.userId))

  return (
    <AdminListTable
      noun="profiles"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={(column) => {
        if (column !== "page" && column !== "board") toggleSort(column)
      }}
      selection={{ noun: "profiles", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "profile-search",
        label: "Search profiles",
        placeholder: "Search name, email or handle",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      filter={{
        count: visibility !== "all" ? 1 : 0,
        onClear: () => setListSearch({ visibility: undefined, page: undefined }),
        children: (
          <FilterPick
            id="profiles-page"
            label="Page"
            value={visibility === "all" ? undefined : visibility}
            any="Every page"
            options={[
              ["public", "Public"],
              ["private", "Switched off"],
              ["hidden", "Hidden by an admin"],
            ]}
            onChange={(next) => setListSearch({ visibility: next, page: undefined })}
          />
        ),
      }}
      bulk={(ids, menu) =>
        showing(ids).length ? (
          <SelectedMenuRow
            className="text-destructive"
            onClick={() => {
              menu.close()
              hide.ask(showing(ids))
            }}
          >
            <EyeOffIcon className="size-4" />
            Hide {showing(ids).length}
          </SelectedMenuRow>
        ) : (
          <p className="px-1.5 py-1 text-sm text-muted-foreground">Every ticked profile is hidden already.</p>
        )
      }
      bulkBusy={hide.deleting}
      rowIds={rowIds}
      record={{
        label: "Member",
        content: (openId) =>
          openId ? (
            <AdminMemberRecord key={openId} userId={openId} />
          ) : (
            <NoRecord title="Member" icon={<IdCardIcon aria-hidden />} line="Nobody has a public profile yet." />
          ),
      }}
      windows={
        <AdminDeleteConfirm
          del={hide}
          title={hiding.length === 1 ? `Hide ${hiding[0].name}'s profile?` : `Hide ${hide.ids.length} ${plural(hide.ids.length, "profile", "profiles")}?`}
          description="The page answers as if it did not exist, and its owner is told in the bell and on their Settings card. Show it again from the member's ⋮, or with Lift under Bans."
          confirmLabel="Hide"
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.userId}
          id={row.userId}
          label={`${row.name}'s profile`}
          tickable={!row.hiddenAt}
          buttons={
            row.hiddenAt
              ? []
              : [{ label: `Hide ${row.name}'s profile`, icon: <EyeOffIcon className="size-4" />, onPress: () => hide.ask([row.userId]) }]
          }
        >
          <MainCell name={row.name} avatar={{ name: row.name, email: row.email }}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {row.publicDisplayName ? `Shown as ${row.publicDisplayName}` : row.email}
            </span>
          </MainCell>
          <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
            <span className="block max-w-48 truncate">/u/{row.handle}</span>
          </TableCell>
          <TableCell column="meta">{formatFocusHours(row.focusSeconds)}</TableCell>
          <TableCell column="meta" className="hidden md:hidden @3xl:table-cell">
            <Chip muted={!row.hiddenAt}>{row.hiddenAt ? "Hidden" : row.profilePublic ? "Public" : "Off"}</Chip>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
            <Chip muted={!row.leaderboardHiddenAt}>
              {row.leaderboardHiddenAt ? "Taken off" : row.leaderboardOptIn ? "On" : "Off"}
            </Chip>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @5xl:table-cell">
            {row.followers.toLocaleString()}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @6xl:table-cell">
            {formatDateTime(row.updatedAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
