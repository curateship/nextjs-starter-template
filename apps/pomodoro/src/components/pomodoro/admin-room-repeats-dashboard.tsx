import * as React from "react"
import { CalendarSyncIcon, StarIcon, StarOffIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { featurePomodoroRoomRepeats, getRoomsAdminErrorMessage } from "@/lib/api/pomodoro/admin-rooms"
import { deletePomodoroRoomRepeats, listPomodoroRoomRepeats, type AdminRoomRepeatRow } from "@/lib/api/pomodoro/admin"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { ROOM_REPEAT_STATUS_FILTERS, RoomRepeatSortColumn } from "@/lib/pomodoro/admin-lists"
import { describeRoomRepeat } from "@/lib/pomodoro/room-repeats"
import { showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = RoomRepeatSortColumn

type WeeklySearch = {
  q?: string
  status?: (typeof ROOM_REPEAT_STATUS_FILTERS)[number]
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Weekly room", column: "main" },
  { key: "host", label: "Host", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "next", label: "Next room", column: "meta" },
  { key: "created", label: "Set up", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
]

/**
 * Rooms → Weekly rooms on the Flowfly dashboard: every weekly room rule. A
 * rule books an ordinary room a day before each of its days, so deleting
 * that room alone does not stop next week's: the rule is what has to go. A
 * rule opens on the right with its days, host and next room.
 */
export function AdminRoomRepeatsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminRoomRepeatRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<WeeklySearch>()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const status = search.status ?? "all"
  const sort: SortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )

  const selection = useSelection()

  const load = React.useCallback(
    (pageSize: number) => listPomodoroRoomRepeats({ search: query, status, sort, direction, page, pageSize }),
    [direction, page, query, sort, status]
  )

  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) => (column === "created" ? "desc" : "asc"))
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const del = useAdminDelete({
    one: "weekly room",
    many: "weekly rooms",
    run: deletePomodoroRoomRepeats,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))

  // A featured rule features every room it books, on Browse rooms.
  const [featuring, setFeaturing] = React.useState(false)
  const feature = async (ids: string[], featured: boolean) => {
    setFeaturing(true)
    try {
      const { changed, same } = await featurePomodoroRoomRepeats(ids, featured)
      const line = describeBulkResult({
        done: changed.length,
        same: same.length,
        kept: 0,
        one: "weekly room",
        many: "weekly rooms",
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
  const when = (row: AdminRoomRepeatRow) => `${describeRoomRepeat(row.weekdays, row.startMinute)} (${row.timezone})`

  return (
    <AdminListTable
      noun="weekly rooms"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "weekly rooms", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "room-repeat-search",
        label: "Search weekly rooms",
        placeholder: "Search room or host",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      filter={{
        count: status !== "all" ? 1 : 0,
        onClear: () => setListSearch({ status: undefined, page: undefined }),
        children: (
          <FilterPick
            id="weekly-status"
            label="Status"
            value={status === "all" ? undefined : status}
            any="Booking and stopped"
            options={[
              ["active", "Still booking"],
              ["cancelled", "Stopped by the host"],
            ]}
            onChange={(next) => setListSearch({ status: next, page: undefined })}
          />
        ),
      }}
      bulk={(ids, menu) => (
        <>
          <SelectedMenuRow
            onClick={() => {
              menu.close()
              void feature(ids, true)
            }}
          >
            <StarIcon className="size-4" />
            Feature
          </SelectedMenuRow>
          <SelectedMenuRow
            onClick={() => {
              menu.close()
              void feature(ids, false)
            }}
          >
            <StarOffIcon className="size-4" />
            Unfeature
          </SelectedMenuRow>
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
        </>
      )}
      bulkBusy={featuring || del.deleting}
      rowIds={rowIds}
      record={{
        label: "Weekly room",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Weekly room" icon={<CalendarSyncIcon aria-hidden />} line="No host has a weekly room yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<CalendarSyncIcon aria-hidden />}
              title={row.name}
              line={`Hosted by ${row.hostName}`}
              hideLabel="Hide the weekly room"
              facts={[
                ["Host", <MemberName key="host" id={row.hostUserId} name={row.hostName} title={row.hostEmail} />],
                // The time is the host's own clock, so their timezone is named beside it.
                ["Repeats", when(row)],
                ["Next room", row.cancelledAt ? "Stopped" : row.nextStartsAt ? formatDateTime(row.nextStartsAt) : "None"],
                ["Shown", row.visibility === "public" ? "Listed" : "Link only"],
                ["Featured", row.featured ? "Yes" : "No"],
                ["Set up", formatDate(row.createdAt)],
              ]}
              state={row.cancelledAt ? "Stopped by the host" : "Still booking"}
              footer={
                <>
                  <Button type="button" variant="outline" disabled={featuring} onClick={() => void feature([row.id], !row.featured)}>
                    {row.featured ? <StarOffIcon /> : <StarIcon />}
                    {row.featured ? "Unfeature" : "Feature"}
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
          title={asked.length === 1 ? `Delete the weekly room ${asked[0].name}?` : `Delete ${del.ids.length} weekly rooms?`}
          description={`No more rooms will be booked from ${plural(del.ids.length, "this rule", "these rules")}. A room already booked for the next day stays and still opens, and past rooms keep their chat. Delete one of those from Rooms if it should not open. This cannot be undone.`}
          confirmLabel={plural(del.ids.length, "Delete weekly room", "Delete weekly rooms")}
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={row.name} onDelete={() => del.ask([row.id])}>
          <MainCell name={row.name}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {when(row)} · {row.visibility === "public" ? "Listed" : "Link only"}
              {row.featured ? " · Featured" : ""}
            </span>
          </MainCell>
          <TableCell column="meta" className="hidden max-w-56 md:hidden @2xl:table-cell">
            <MemberName id={row.hostUserId} name={row.hostName} title={row.hostEmail} className="max-w-full font-normal" />
          </TableCell>
          <TableCell column="meta">
            {row.cancelledAt ? <Chip muted>Stopped</Chip> : row.nextStartsAt ? formatDateTime(row.nextStartsAt) : "-"}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @5xl:table-cell">
            {formatDate(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
