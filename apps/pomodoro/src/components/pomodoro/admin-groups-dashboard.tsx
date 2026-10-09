import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { SettingsIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
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
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { GroupSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-groups")

type SortColumn = GroupSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Group", column: "main" },
  { key: "owner", label: "Owner", column: "meta" },
  { key: "members", label: "Members", column: "meta" },
  { key: "created", label: "Made", column: "meta", className: "hidden lg:table-cell" },
]

/**
 * Every private focus group (admin task 06, part 11): who owns it, how many
 * are in it, and deleting it. A group's window lists its members. Deleting
 * tells everybody who was in it. See `workspace/docs/admin-members.md`.
 */
export function AdminGroupsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminGroupRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
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
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    (pageSize: number) =>
      listPomodoroGroups({ search: query, user: userId, sort, direction, page, pageSize }),
    [direction, page, query, sort, userId]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" || column === "owner" ? "asc" : "desc"
  )
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
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

  const navigate = useNavigate()
  const setOpen = React.useCallback(
    (id: string | undefined) => {
      // Not `replace`: Back closes the window, the way every record window does.
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )

  return (
    <>
      <AdminListTable
        title="Focus groups"
        icon={<UsersIcon />}
        noun="groups"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "groups", rowIds, state: selection }}
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
                One member's groups
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="group-search"
              aria-label="Search groups"
              placeholder="Search group or owner…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.id} className="group" rowAction={() => setOpen(row.id)}>
            <AdminSelectCell selection={selection} id={row.id} label={`Select ${row.name}`} />
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left font-medium group-hover:underline"
                title={row.name}
                onClick={() => setOpen(row.id)}
              >
                {row.name}
              </button>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <MemberName id={row.ownerId} name={row.ownerName} className="max-w-56" />
            </TableCell>
            <TableCell column="meta">{row.memberCount}</TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Settings for ${row.name}`}
                onClick={() => setOpen(row.id)}
              >
                <SettingsIcon className="size-4" />
              </Button>
              <AdminRowDeleteButton del={del} id={row.id} label={`Delete ${row.name}`} />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminGroupDialog
        openId={search.open}
        onClose={() => setOpen(undefined)}
        onDelete={(id) => {
          setOpen(undefined)
          del.ask([id])
        }}
      />
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1
            ? `Delete ${asked[0].name}?`
            : `Delete ${del.ids.length} ${plural(del.ids.length, "group", "groups")}?`
        }
        description={`${
          asked.length === del.ids.length
            ? `${askedPeople} ${plural(askedPeople, "person is", "people are")} in ${plural(del.ids.length, "it", "them")}, and each is told in the bell that the group was deleted.`
            : "Everybody in them is told in the bell that the group was deleted."
        } Their focus time and the global leaderboard are untouched. This cannot be undone.`}
        confirmLabel={plural(del.ids.length, "Delete group", "Delete groups")}
      />
    </>
  )
}

/** One group's members, read-only, with Delete at the far left. */
function AdminGroupDialog({
  openId,
  onClose,
  onDelete,
}: {
  openId: string | undefined
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const [loaded, setLoaded] = React.useState<AdminGroup | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  // Closing clears nothing, so the window fades out as it was.
  const [shownFor, setShownFor] = React.useState<string | undefined>(undefined)
  if (shownFor !== openId && openId === undefined) setShownFor(undefined)
  else if (shownFor !== openId) {
    setShownFor(openId)
    setLoaded(null)
    setLoadError(null)
  }
  // Kept after closing, so the window fades out as it was.
  const shown = loaded

  React.useEffect(() => {
    if (!openId) return
    let live = true
    loadPomodoroGroup(openId).then(
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
  }, [openId, attempt])

  return (
    <Dialog
      open={openId !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{shown?.group.name ?? "Focus group"}</DialogTitle>
          <DialogDescription>
            {shown
              ? `Owned by ${shown.group.ownerName}, made ${formatDate(shown.group.createdAt)}.`
              : "Who is in this group."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {loadError ? (
            <ErrorRow
              message={loadError}
              onRetry={() => {
                setLoadError(null)
                setAttempt((count) => count + 1)
              }}
            />
          ) : !shown ? (
            <LoadingRow label="Loading…" className="min-h-48" />
          ) : (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>
                  {shown.members.length} {plural(shown.members.length, "person", "people")}, owner first.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {shown.members.map((member) => (
                  <div key={member.userId} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <MemberName id={member.userId} name={member.name} className="text-sm" />
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.userId === shown.group.ownerId ? "Owner · " : ""}
                        {member.email}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Joined {formatDate(member.joinedAt)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </DialogBody>
        <DialogFooter>
          {shown ? (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              onClick={() => onDelete(shown.group.id)}
            >
              <Trash2Icon className="size-4" />
              Delete
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
