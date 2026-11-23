import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListChecksIcon, TagIcon, Trash2Icon } from "lucide-react"

import { TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { deletePomodoroTags, listPomodoroTags, type AdminTagRow } from "@/lib/api/pomodoro/admin-uploads-tags"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { TagSortColumn } from "@/lib/pomodoro/admin-lists"
import { flowflyLink } from "@/lib/pomodoro/flowfly-search"

type SortColumn = TagSortColumn

type TagsSearch = {
  q?: string
  user?: string
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Tag", column: "main" },
  { key: "owner", label: "Owner", column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "tasks", label: "Tasks", column: "meta" },
  { key: "created", label: "Made", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
]

/**
 * Tasks → Tags on the Flowfly dashboard: every tag a member made for their
 * tasks (admin task 06, part 4), and deleting one. Not the theme and sound
 * tags, which are on Backgrounds and Sounds. A tag opens on the right with
 * its owner, how many tasks carry it, and Show their tasks. See
 * `workspace/docs/tasks.md` and `workspace/docs/admin-dashboard.md`.
 */
export function AdminTagsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminTagRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<TagsSearch>()
  const setListSearch = useListSearchNavigate()
  const navigate = useNavigate()
  const query = search.q ?? ""
  const userId = search.user
  const sort: SortColumn = search.sort ?? "tasks"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
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
  const showTasks = (row: AdminTagRow) => void navigate({ to: "/admin/flowfly", search: flowflyLink("tasks", { user: row.userId }) })

  return (
    <AdminListTable
      noun="tags"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "tags", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "tag-search",
        label: "Search tags",
        placeholder: "Search tag, name or email",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredOwner, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
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
        label: "Tag",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Tag" icon={<TagIcon aria-hidden />} line="No member has made a task tag yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<TagIcon aria-hidden />}
              title={row.name}
              line={row.ownerName}
              hideLabel="Hide the tag"
              facts={[
                ["Owner", <MemberName key="owner" id={row.userId} name={row.ownerName} title={row.ownerEmail} />],
                ["Tasks", row.taskCount.toLocaleString()],
                ["Made", formatDate(row.createdAt)],
              ]}
              state={`${row.taskCount.toLocaleString()} ${plural(row.taskCount, "task", "tasks")}`}
              footer={
                <>
                  <Button type="button" variant="outline" onClick={() => showTasks(row)}>
                    <ListChecksIcon />
                    Their tasks
                  </Button>
                  <Button type="button" variant="outline" className="text-destructive" onClick={() => del.ask([row.id])}>
                    <Trash2Icon />
                    Delete
                  </Button>
                </>
              }
            />
          )
        },
      }}
      windows={
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
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.id}
          id={row.id}
          label={row.name}
          onDelete={() => del.ask([row.id])}
          buttons={[{ label: `Tasks for ${row.ownerName}`, icon: <ListChecksIcon className="size-4" />, onPress: () => showTasks(row) }]}
        >
          <MainCell name={row.name} />
          <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
            <MemberName id={row.userId} name={row.ownerName} title={row.ownerEmail} className="max-w-48" />
          </TableCell>
          <TableCell column="meta">{row.taskCount.toLocaleString()}</TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
            {formatDate(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
