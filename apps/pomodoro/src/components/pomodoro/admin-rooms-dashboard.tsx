import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { DoorClosedIcon, DoorOpenIcon, FlagIcon, Loader2Icon, MegaphoneIcon, StarIcon, StarOffIcon, Trash2Icon } from "lucide-react"

import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminRoomDialog } from "@/components/pomodoro/admin-room-dialogs"
import { MessageLiveRoomsDialog } from "@/components/pomodoro/admin-message-live-rooms"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { RoomRecord } from "@/components/pomodoro/flowfly/room-record"
import { closePomodoroRooms, featurePomodoroRooms, getRoomsAdminErrorMessage } from "@/lib/api/pomodoro/admin-rooms"
import {
  deletePomodoroRooms,
  listPomodoroRooms,
  previewPomodoroRoomDeletion,
  type AdminRoomRow,
} from "@/lib/api/pomodoro/admin"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { formatDateTime } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { ROOM_PHASE_FILTERS, ROOM_VISIBILITY_FILTERS, RoomSortColumn } from "@/lib/pomodoro/admin-lists"
import { flowflyLink } from "@/lib/pomodoro/flowfly-search"
import { showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = RoomSortColumn

type RoomsSearch = {
  q?: string
  phase?: (typeof ROOM_PHASE_FILTERS)[number]
  visibility?: (typeof ROOM_VISIBILITY_FILTERS)[number]
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Room", column: "main" },
  { key: "host", label: "Host", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "phase", label: "Doing now", column: "meta" },
  { key: "members", label: "In the room", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
  { key: "created", label: "Opened", column: "meta", className: "hidden md:hidden @6xl:table-cell" },
]

const PHASE_WORDS: Record<string, string> = {
  waiting: "Waiting",
  focus: "Focusing",
  short: "Short break",
  long: "Long break",
  scheduled: "Booked",
  closed: "Closed",
}

/**
 * Rooms → Rooms on the Flowfly dashboard: every focus room, open and
 * closed, newest first. A room is closed by its host or by the host starting
 * another one, and closed rows stay so a report about a room can still be
 * read in context, until an admin deletes it. A room opens on the right with
 * its chat, reports, invitations, bans and weekly rule (Tyler's picks
 * "Room holds chat+reports" and "Room bans + weekly rule"). "Message live
 * rooms" moved here from the Chat page, into the ⋮.
 */
export function AdminRoomsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminRoomRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<RoomsSearch>()
  const setListSearch = useListSearchNavigate()
  const navigate = useNavigate()
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

  const load = React.useCallback(
    (pageSize: number) => listPomodoroRooms({ search: query, phase, visibility, sort, direction, page, pageSize }),
    [direction, page, phase, query, sort, visibility]
  )

  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" || column === "members" ? "desc" : "asc"
  )
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
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
  const openOnes = (ids: string[]) => ids.filter((id) => !list.rows.find((row) => row.id === id)?.closedAt)

  const [featuring, setFeaturing] = React.useState(false)
  const busy = featuring || del.deleting || close.deleting
  const feature = async (ids: string[], featured: boolean) => {
    setFeaturing(true)
    try {
      const { changed, same } = await featurePomodoroRooms(ids, featured)
      const line = describeBulkResult({
        done: changed.length,
        same: same.length,
        kept: 0,
        one: "room",
        many: "rooms",
        verb: featured ? "featured" : "unfeatured",
      })
      if (!changed.length) showErrorToast(line)
      selection.clear()
      await list.refresh()
    } catch (error) {
      showErrorToast(getRoomsAdminErrorMessage(error))
    } finally {
      setFeaturing(false)
    }
  }
  // The room settings window, opened from a room's ⋮.
  const [settingsFor, setSettingsFor] = React.useState<string | undefined>(undefined)
  const [messaging, setMessaging] = React.useState(false)
  const liveRooms = list.rows.filter((row) => !row.closedAt).length
  // The reason an admin opens a room is usually a complaint about it, so a
  // row leads to Reports searched on this room's name.
  const showReports = (row: AdminRoomRow) => void navigate({ to: "/admin/flowfly", search: flowflyLink("reports", { q: row.name }) })

  return (
    <AdminListTable
      noun="rooms"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "rooms", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "room-search",
        label: "Search rooms",
        placeholder: "Search room or host",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      filter={{
        count: (phase !== "all" ? 1 : 0) + (visibility !== "all" ? 1 : 0),
        onClear: () => setListSearch({ phase: undefined, visibility: undefined, page: undefined }),
        children: (
          <>
            <FilterPick
              id="rooms-phase"
              label="Doing now"
              value={phase === "all" ? undefined : phase}
              any="Anything"
              options={[
                ["waiting", "Waiting"],
                ["focus", "Focusing"],
                ["short", "Short break"],
                ["long", "Long break"],
                ["closed", "Closed"],
              ]}
              onChange={(next) => setListSearch({ phase: next, page: undefined })}
            />
            <FilterPick
              id="rooms-visibility"
              label="Shown"
              value={visibility === "all" ? undefined : visibility}
              any="Listed and unlisted"
              options={[
                ["public", "Listed"],
                ["unlisted", "Link only"],
              ]}
              onChange={(next) => setListSearch({ visibility: next, page: undefined })}
            />
          </>
        ),
      }}
      menuItems={[{ label: "Message live rooms", icon: <MegaphoneIcon className="size-4" />, onClick: () => setMessaging(true) }]}
      bulk={(ids, menu) => {
        const run = (work: () => void) => () => {
          menu.close()
          work()
        }
        return (
          <>
            {openOnes(ids).length ? (
              <SelectedMenuRow onClick={run(() => close.ask(openOnes(ids)))}>
                <DoorClosedIcon className="size-4" />
                Close {openOnes(ids).length} open
              </SelectedMenuRow>
            ) : null}
            <SelectedMenuRow onClick={run(() => void feature(ids, true))}>
              {featuring ? <Loader2Icon className="size-4 animate-spin" /> : <StarIcon className="size-4" />}
              Feature
            </SelectedMenuRow>
            <SelectedMenuRow onClick={run(() => void feature(ids, false))}>
              <StarOffIcon className="size-4" />
              Unfeature
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            <SelectedMenuRow className="text-destructive" onClick={run(() => del.ask(ids))}>
              <Trash2Icon className="size-4" />
              Delete
            </SelectedMenuRow>
          </>
        )
      }}
      bulkBusy={busy}
      rowIds={rowIds}
      record={{
        label: "Room",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Room" icon={<DoorOpenIcon aria-hidden />} line="Nobody has opened a room yet." />
          return (
            <RoomRecord
              key={row.id}
              row={row}
              onChanged={list.refresh}
              onSettings={() => setSettingsFor(row.id)}
              onFeature={(featured) => void feature([row.id], featured)}
              onClose={() => close.ask([row.id])}
              onDelete={() => del.ask([row.id])}
            />
          )
        },
      }}
      windows={
        <>
          <AdminDeleteConfirm
            del={close}
            title={closing.length === 1 ? `Close ${closing[0].name}?` : `Close ${close.ids.length} rooms?`}
            description="Everybody inside is taken out and told the room has ended. The chat, the members and any reports are kept, and the host is told in the bell. A booked room that has not opened is cancelled with its unsent invitations. A closed room cannot be opened again."
            confirmLabel={plural(close.ids.length, "Close room", "Close rooms")}
          />
          <AdminRoomDialog openId={settingsFor} onClose={() => setSettingsFor(undefined)} onSaved={list.refresh} />
          <MessageLiveRoomsDialog open={messaging} liveRooms={liveRooms} onClose={() => setMessaging(false)} />
          <AdminDeleteConfirm
            del={del}
            title={asked.length === 1 ? `Delete ${asked[0].name}?` : `Delete ${del.ids.length} rooms?`}
            description={<RoomDeletionSummary ids={del.ids} />}
            confirmLabel={plural(del.ids.length, "Delete room", "Delete rooms")}
          />
        </>
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.id}
          id={row.id}
          label={row.name}
          onDelete={() => del.ask([row.id])}
          buttons={[{ label: `Reports about ${row.name}`, icon: <FlagIcon className="size-4" />, onPress: () => showReports(row) }]}
        >
          <MainCell name={row.name}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              /{row.slug} · {row.visibility === "public" ? "Listed" : "Link only"}
              {row.featuredAt ? " · Featured" : ""}
            </span>
          </MainCell>
          <TableCell column="meta" className="hidden max-w-56 md:hidden @2xl:table-cell">
            <MemberName id={row.hostUserId} name={row.hostName} title={row.hostEmail} className="max-w-full font-normal" />
          </TableCell>
          <TableCell column="meta">
            <Chip muted={row.phase !== "focus"}>{PHASE_WORDS[row.phase] ?? row.phase}</Chip>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
            {row.memberCount}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @6xl:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
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
  // The selection whose count failed, like `counts.for`, so a failure belongs
  // to that one window and the next selection is counted afresh.
  const [failedFor, setFailedFor] = React.useState<string | null>(null)
  const key = ids.join(",")

  React.useEffect(() => {
    if (!ids.length) return
    let live = true
    previewPomodoroRoomDeletion(ids).then(
      (result) => {
        if (live) setCounts({ for: key, ...result })
      },
      () => {
        if (live) setFailedFor(key)
      }
    )
    return () => {
      live = false
    }
  }, [ids, key])

  const rooms = plural(ids.length, "This room", `These ${ids.length} rooms`)
  const kept = `Focus sessions people ran in ${ids.length === 1 ? "it" : "them"} are kept. This cannot be undone.`
  if (failedFor === key)
    return (
      <>{`${rooms} and their chat will be deleted. What goes with ${ids.length === 1 ? "it" : "them"} could not be counted. ${kept}`}</>
    )
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
