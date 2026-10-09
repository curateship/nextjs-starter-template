import * as React from "react"
import { getRouteApi, Link } from "@tanstack/react-router"
import { ListChecksIcon, TagIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, AdminSelectCell, useAdminList } from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { deletePomodoroTags, listPomodoroTags, type AdminTagRow } from "@/lib/api/pomodoro/admin-uploads-tags"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import type { TagSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-tags")

type SortColumn = TagSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Tag", column: "main" },
  { key: "owner", label: "Owner", column: "meta" },
  { key: "tasks", label: "Tasks", column: "meta" },
  { key: "created", label: "Made", column: "meta", className: "hidden lg:table-cell" },
]

/**
 * Every tag a member made for their tasks (admin task 06, part 4), and
 * deleting one. Not the theme and sound tags, which are on Themes and Sounds.
 * See `workspace/docs/tasks.md`.
 */
export function AdminTagsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminTagRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const userId = search.user
  const sort: SortColumn = search.sort ?? "tasks"
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
    (pageSize: number) => listPomodoroTags({ search: query, user: userId, sort, direction, page, pageSize }),
    [direction, page, query, sort, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" || column === "owner" ? "asc" : "desc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "tag",
    many: "tags",
    run: deletePomodoroTags,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))
  const tagged = asked.reduce((sum, row) => sum + row.taskCount, 0)
  const filteredOwner = userId ? (list.rows[0]?.ownerName ?? null) : null

  return (
    <>
      <AdminListTable
        title="Task tags"
        icon={<TagIcon />}
        noun="tags"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "tags", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            {userId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => setListSearch({ user: undefined, page: undefined })}
              >
                <XIcon className="size-4" />
                {filteredOwner ? `Only ${filteredOwner}` : "One member only"}
              </Button>
            ) : null}
            <DashboardToolbarSearch
              name="tag-search"
              aria-label="Search tags"
              placeholder="Search tag, name or email…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.id}>
            <AdminSelectCell selection={selection} id={row.id} label={`Select the tag ${row.name}`} />
            <TableCell column="main">
              <span className="block max-w-80 truncate text-sm font-medium" title={row.name}>
                {row.name}
              </span>
            </TableCell>
            <TableCell column="meta">
              <MemberName id={row.userId} name={row.ownerName} title={row.ownerEmail} className="max-w-48" />
            </TableCell>
            <TableCell column="meta">{row.taskCount.toLocaleString()}</TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {formatDate(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <Button type="button" variant="ghost" size="icon" asChild>
                <Link
                  to="/admin/pomodoro-tasks"
                  search={{ user: row.userId }}
                  aria-label={`Tasks for ${row.ownerName}`}
                >
                  <ListChecksIcon className="size-4" />
                </Link>
              </Button>
              <AdminRowDeleteButton del={del} id={row.id} label={`Delete the tag ${row.name}`} />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1
            ? `Delete the tag ${asked[0].name}?`
            : `Delete ${del.ids.length} ${plural(del.ids.length, "tag", "tags")}?`
        }
        description={[
          tagged
            ? `${tagged.toLocaleString()} ${plural(tagged, "task loses", "tasks lose")} the label. The tasks themselves stay.`
            : "No task uses it.",
          "Focus reports stop offering it as a filter. The owner is not told.",
          "This cannot be undone.",
        ].join(" ")}
        confirmLabel={plural(del.ids.length, "Delete tag", "Delete tags")}
      />
    </>
  )
}
