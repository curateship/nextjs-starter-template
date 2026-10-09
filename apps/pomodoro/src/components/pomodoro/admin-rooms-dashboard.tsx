import * as React from "react"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import {
  DoorClosedIcon,
  FlagIcon,
  Loader2Icon,
  SettingsIcon,
  StarIcon,
  StarOffIcon,
  UsersRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { AdminRoomDialog } from "@/components/pomodoro/admin-room-dialogs"
import {
  closePomodoroRooms,
  featurePomodoroRooms,
  getRoomsAdminErrorMessage,
} from "@/lib/api/pomodoro/admin-rooms"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminSelectCell,
  AdminListTable,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import {
  deletePomodoroRooms,
  getPomodoroAdminErrorMessage,
  listPomodoroRooms,
  previewPomodoroRoomDeletion,
  type AdminRoomRow,
} from "@/lib/api/pomodoro/admin"
import { plural } from "@/lib/format/plural"
import { formatDateTime } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { RoomSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-rooms")

type SortColumn = RoomSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Room", column: "main" },
  { key: "host", label: "Host", column: "meta" },
  { key: "phase", label: "Doing now", column: "meta" },
  { key: "members", label: "In the room", column: "meta" },
  {
    key: "created",
    label: "Opened",
    column: "meta",
    className: "hidden 2xl:table-cell",
  },
]

const PHASE_LOOK: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  waiting: { label: "Waiting", variant: "outline" },
  focus: { label: "Focusing", variant: "default" },
  short: { label: "Short break", variant: "secondary" },
  long: { label: "Long break", variant: "secondary" },
  closed: { label: "Closed", variant: "outline" },
}

/**
 * Every focus room, open and closed, newest first. A room is closed by its
 * host or by the host starting another one, and closed rows stay so a report
 * about a room can still be read in context, until an operator deletes it.
 */
export function AdminRoomsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminRoomRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const phase = search.phase ?? "all"
  const visibility = search.visibility ?? "all"
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
      listPomodoroRooms({
        search: query,
        phase,
        visibility,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, page, phase, query, sort, visibility]
  )

  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" || column === "members" ? "desc" : "asc"
  )
  const rowIds = React.useMemo(
    () => list.rows.map((row) => row.id),
    [list.rows]
  )
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "room",
    many: "rooms",
    run: deletePomodoroRooms,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))

  // Closing ends a room without deleting it: people are sent out and the chat,
  // members and reports stay. It asks first, the same way a delete does.
  const close = useAdminDelete({
    one: "room",
    many: "rooms",
    run: async (ids) => {
      const { closed, skipped } = await closePomodoroRooms(ids)
      return { deleted: closed, skipped }
    },
    verb: "closed",
    keptReason: "already closed",
    selection,
    onDone: list.refresh,
  })
  const closing = list.rows.filter((row) => close.ids.includes(row.id))
  const openIds = selectedIds.filter(
    (id) => !list.rows.find((row) => row.id === id)?.closedAt
  )

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

  const [featuring, setFeaturing] = React.useState(false)
  const feature = async (featured: boolean) => {
    setFeaturing(true)
    try {
      const { changed, same } = await featurePomodoroRooms(selectedIds, featured)
      toast.success(
        describeBulkResult({
          done: changed.length,
          same: same.length,
          kept: 0,
          one: "room",
          many: "rooms",
          verb: featured ? "featured" : "unfeatured",
        })
      )
      selection.clear()
      await list.refresh()
    } catch (error) {
      showErrorToast(getRoomsAdminErrorMessage(error))
    } finally {
      setFeaturing(false)
    }
  }

  return (
    <>
      <AdminListTable
        title="Focus rooms"
        icon={<UsersRoundIcon />}
        noun="rooms"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "rooms", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            <AdminBulkDeleteButton
              del={close}
              ids={openIds}
              label="Close"
              icon={<DoorClosedIcon className="size-4" />}
            />
            {selectedIds.length ? (
              <>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={featuring}
                  onClick={() => void feature(true)}
                >
                  <StarIcon className="size-4" />
                  Feature
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={featuring}
                  onClick={() => void feature(false)}
                >
                  <StarOffIcon className="size-4" />
                  Unfeature
                </DashboardToolbarButton>
              </>
            ) : null}
            <DashboardToolbarSearch
              name="room-search"
              aria-label="Search rooms"
              placeholder="Search room or host…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={phase}
              onValueChange={(value) =>
                setListSearch({
                  phase: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by what the room is doing">
                <SelectValue placeholder="Doing now" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anything</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="focus">Focusing</SelectItem>
                <SelectItem value="short">Short break</SelectItem>
                <SelectItem value="long">Long break</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={visibility}
              onValueChange={(value) =>
                setListSearch({
                  visibility: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by who can find the room">
                <SelectValue placeholder="Listing" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Listed and unlisted</SelectItem>
                <SelectItem value="public">Listed</SelectItem>
                <SelectItem value="unlisted">Link only</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        {list.rows.map((row) => (
          // An ended room cannot be changed, so it has no window to open.
          <TableRow
            key={row.id}
            className="group"
            rowAction={row.closedAt ? undefined : () => setOpen(row.id)}
          >
            <AdminSelectCell
              selection={selection}
              id={row.id}
              label={`Select ${row.name}`}
            />
            <TableCell column="main">
              <div className="min-w-0">
                {row.closedAt ? (
                  <span className="block max-w-96 truncate font-medium" title={row.name}>
                    {row.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="block max-w-96 truncate text-left font-medium group-hover:underline"
                    title={row.name}
                    onClick={() => setOpen(row.id)}
                  >
                    {row.name}
                  </button>
                )}
                <span className="block max-w-96 truncate text-xs text-muted-foreground">
                  /{row.slug} ·{" "}
                  {row.visibility === "public" ? "Listed" : "Link only"}
                  {row.featuredAt ? " · Featured" : ""}
                </span>
              </div>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <MemberName id={row.hostUserId} name={row.hostName} title={row.hostEmail} className="max-w-full font-normal" />
            </TableCell>
            <TableCell column="meta">
              <Badge variant={PHASE_LOOK[row.phase]?.variant ?? "outline"}>
                {PHASE_LOOK[row.phase]?.label ?? row.phase}
              </Badge>
            </TableCell>
            <TableCell column="meta">{row.memberCount}</TableCell>
            <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              {/* The reason an operator opens a room row is usually a complaint
                  about it, so the row leads to the queue searched on this room's
                  name. The report list already matches on room name. */}
              <Button type="button" variant="ghost" size="icon" asChild>
                <Link
                  to="/admin/pomodoro-reports"
                  search={{ q: row.name }}
                  aria-label={`Reports about ${row.name}`}
                >
                  <FlagIcon className="size-4" />
                </Link>
              </Button>
              {row.closedAt ? null : (
                <>
                  <AdminRowDeleteButton
                    del={close}
                    id={row.id}
                    label={`Close ${row.name}`}
                    icon={<DoorClosedIcon className="size-4" />}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Settings for ${row.name}`}
                    onClick={() => setOpen(row.id)}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                </>
              )}
              <AdminRowDeleteButton
                del={del}
                id={row.id}
                label={`Delete ${row.name}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={close}
        title={
          closing.length === 1
            ? `Close ${closing[0].name}?`
            : `Close ${close.ids.length} rooms?`
        }
        description="Everybody inside is taken out and told the room has ended. The chat, the members and any reports are kept, and the host is told in the bell. A booked room that has not opened is cancelled with its unsent invitations. A closed room cannot be opened again."
        confirmLabel={plural(close.ids.length, "Close room", "Close rooms")}
      />
      <AdminRoomDialog
        openId={search.open}
        onClose={() => setOpen(undefined)}
        onSaved={list.refresh}
      />
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1
            ? `Delete ${asked[0].name}?`
            : `Delete ${del.ids.length} rooms?`
        }
        description={<RoomDeletionSummary ids={del.ids} />}
        confirmLabel={plural(del.ids.length, "Delete room", "Delete rooms")}
      />
    </>
  )
}

/**
 * What goes with the rooms, counted by the server when the window opens: the
 * chat and the reports go with a room, and anybody still inside is sent out.
 */
function RoomDeletionSummary({ ids }: { ids: string[] }) {
  const [counts, setCounts] = React.useState<{
    for: string
    messages: number
    reports: number
    inRoom: number
  } | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const key = ids.join(",")

  React.useEffect(() => {
    if (!ids.length) return
    let live = true
    previewPomodoroRoomDeletion(ids).then(
      (result) => {
        if (live) setCounts({ for: key, ...result })
      },
      (error) => {
        if (live) setFailed(getPomodoroAdminErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [ids, key])

  const rooms = plural(ids.length, "This room", `These ${ids.length} rooms`)
  const kept = `Focus sessions people ran in ${ids.length === 1 ? "it" : "them"} are kept. This cannot be undone.`
  if (failed) return <>{`${rooms} and their chat will be deleted. ${kept}`}</>
  if (!counts || counts.for !== key) {
    return (
      <span className="inline-flex items-center gap-2">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Counting what goes with {ids.length === 1 ? "it" : "them"}…
      </span>
    )
  }
  const parts = [
    `${counts.messages} chat ${plural(counts.messages, "message", "messages")}`,
    `${counts.reports} ${plural(counts.reports, "report", "reports")}`,
  ]
  const inside = counts.inRoom
    ? ` The ${counts.inRoom} ${plural(counts.inRoom, "person", "people")} inside will be told the room is gone.`
    : ""
  return (
    <>{`${rooms} will be deleted, with ${parts.join(" and ")}.${inside} ${kept}`}</>
  )
}
