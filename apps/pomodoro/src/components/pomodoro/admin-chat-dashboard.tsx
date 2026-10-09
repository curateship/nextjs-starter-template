import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  InboxIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  SearchIcon,
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
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardCardHeaderIcon } from "@/components/shared/dashboard-card-header"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminListTable,
  AdminSelectCell,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { AdminRoomChatDialog } from "@/components/pomodoro/admin-room-chat-dialog"
import { MessageLiveRoomsDialog } from "@/components/pomodoro/admin-message-live-rooms"
import {
  deletePomodoroMessages,
  getSafetyErrorMessage,
  listPomodoroChat,
  releasePomodoroMessages,
  type AdminChatRoomRow,
  type AdminChatSearchRow,
} from "@/lib/api/pomodoro/admin-safety"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { ChatRoomSortColumn, ChatTab } from "@/lib/pomodoro/admin-lists"
import { showErrorToast } from "@/lib/toast/error-toast"

const route = getRouteApi("/_authenticated/admin/pomodoro-chat")

type ChatList =
  | { tab: "rooms"; rows: AdminChatRoomRow[]; total: number }
  | { tab: "messages" | "held"; rows: AdminChatSearchRow[]; total: number }

const TAB_LOOK: Record<ChatTab, { label: string; icon: React.ReactNode }> = {
  rooms: { label: "Rooms", icon: <MessagesSquareIcon /> },
  messages: { label: "Search messages", icon: <SearchIcon /> },
  held: { label: "Held", icon: <InboxIcon /> },
}

/** Opens a room's chat in the window, kept in the address so Back shuts it. */
function useOpenRoomChat() {
  const navigate = useNavigate()
  return React.useCallback(
    (roomId: string | undefined, messageId?: string) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          delete next.open
          delete next.message
          if (roomId) next.open = roomId
          if (roomId && messageId) next.message = messageId
          return next
        },
      })
    },
    [navigate]
  )
}

/**
 * Every room's chat in one place (admin task 05): the rooms that have chat,
 * a search across every line by word or by person, and the lines held for a
 * blocked word. A room opens its whole chat in a window. See
 * `workspace/docs/admin-safety-tools.md`.
 */
export function AdminChatDashboard({
  initial,
  initialPageSize,
  liveRooms,
  held,
}: {
  initial: ChatList
  initialPageSize: number
  liveRooms: number
  held: number
}) {
  const search = route.useSearch()
  const tab: ChatTab = search.tab ?? "rooms"
  const setListSearch = useListSearchNavigate()
  const openChat = useOpenRoomChat()
  const [messaging, setMessaging] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const tabs = (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        setListSearch({
          tab: value === "rooms" ? undefined : value,
          page: undefined,
          sort: undefined,
          direction: undefined,
          status: undefined,
        })
      }
    >
      <TabsList>
        {(Object.keys(TAB_LOOK) as ChatTab[]).map((value) => (
          <TabsTrigger key={value} value={value} className="group/chat-tab">
            <DashboardCardHeaderIcon className="group-data-[state=active]/chat-tab:text-foreground">
              {TAB_LOOK[value].icon}
            </DashboardCardHeaderIcon>
            {TAB_LOOK[value].label}
            {value === "held" && held ? <TabsCount>{held}</TabsCount> : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
  const messageButton = (
    <DashboardToolbarButton type="button" variant="outline" onClick={() => setMessaging(true)}>
      <MegaphoneIcon className="size-4" />
      Message live rooms
    </DashboardToolbarButton>
  )

  return (
    <>
      {/* Keyed by tab, so a tab's own list starts from what the loader read for it. */}
      {initial.tab === "rooms" ? (
        <ChatRoomsTable
          key={`rooms-${refreshKey}`}
          initial={initial}
          initialPageSize={initialPageSize}
          tabs={tabs}
          extra={messageButton}
          onOpen={(id) => openChat(id)}
        />
      ) : (
        <ChatMessagesTable
          key={`${initial.tab}-${refreshKey}`}
          held={initial.tab === "held"}
          initial={initial}
          initialPageSize={initialPageSize}
          tabs={tabs}
          extra={messageButton}
          onOpen={(roomId, messageId) => openChat(roomId, messageId)}
        />
      )}
      <AdminRoomChatDialog
        roomId={search.open}
        messageId={search.message}
        onClose={() => openChat(undefined)}
        onChanged={() => setRefreshKey((key) => key + 1)}
      />
      <MessageLiveRoomsDialog open={messaging} liveRooms={liveRooms} onClose={() => setMessaging(false)} />
    </>
  )
}

const ROOM_COLUMNS: TableHeaderColumn<ChatRoomSortColumn>[] = [
  { key: "name", label: "Room", column: "main" },
  { key: "messages", label: "Messages", column: "meta" },
  { key: "last", label: "Last message", column: "meta" },
]

function ChatRoomsTable({
  initial,
  initialPageSize,
  tabs,
  extra,
  onOpen,
}: {
  initial: { rows: AdminChatRoomRow[]; total: number }
  initialPageSize: number
  tabs: React.ReactNode
  extra: React.ReactNode
  onOpen: (roomId: string) => void
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const status = search.status ?? "all"
  const sort: ChatRoomSortColumn = search.sort ?? "last"
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
    async (pageSize: number) => {
      const result = await listPomodoroChat({ tab: "rooms", search: query, status, sort, direction, page, pageSize })
      return result.tab === "rooms" ? result : { rows: [], total: 0 }
    },
    [direction, page, query, sort, status]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<ChatRoomSortColumn>({ sort, direction }, (column) =>
    column === "name" ? "asc" : "desc"
  )

  return (
    <AdminListTable
      title="Chat"
      icon={<MessagesSquareIcon />}
      tabs={tabs}
      noun="rooms with chat"
      columns={ROOM_COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      trailing={<TableHead column="meta">Status</TableHead>}
      list={list}
      page={page}
      onPageChange={setPage}
      controls={
        <>
          {extra}
          <DashboardToolbarSearch
            name="chat-room-search"
            aria-label="Search rooms"
            placeholder="Search room or host…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={status}
            onValueChange={(value) =>
              setListSearch({ status: value === "all" ? undefined : value, page: undefined })
            }
          >
            <DashboardToolbarSelectTrigger aria-label="Filter by open or ended">
              <SelectValue placeholder="Status" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">Open and ended</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Ended</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      {list.rows.map((row) => (
        <TableRow key={row.id} className="group" rowAction={() => onOpen(row.id)}>
          <TableCell column="main">
            <button
              type="button"
              className="block max-w-96 truncate text-left font-medium group-hover:underline"
              onClick={() => onOpen(row.id)}
            >
              {row.name}
            </button>
            <span className="block max-w-96 truncate text-xs text-muted-foreground">
              Hosted by <MemberName id={row.hostUserId} name={row.hostName} className="inline font-normal" />
              {row.held ? ` · ${row.held} held` : ""}
            </span>
          </TableCell>
          <TableCell column="meta">{row.messages.toLocaleString()}</TableCell>
          <TableCell column="mutedMeta">{formatDateTime(row.lastAt)}</TableCell>
          <TableCell column="meta">
            <Badge variant={row.closed ? "outline" : "default"}>{row.closed ? "Ended" : "Open"}</Badge>
          </TableCell>
        </TableRow>
      ))}
    </AdminListTable>
  )
}

type MessageColumn = "message"
const MESSAGE_COLUMNS: TableHeaderColumn<MessageColumn>[] = [
  { key: "message", label: "Message", column: "main", sortable: false },
]

/** The search across every line, or the held lines. Newest first. */
function ChatMessagesTable({
  held,
  initial,
  initialPageSize,
  tabs,
  extra,
  onOpen,
}: {
  held: boolean
  initial: { rows: AdminChatSearchRow[]; total: number }
  initialPageSize: number
  tabs: React.ReactNode
  extra: React.ReactNode
  onOpen: (roomId: string, messageId: string) => void
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    async (pageSize: number) => {
      const result = await listPomodoroChat({ tab: held ? "held" : "messages", search: query, page, pageSize })
      return result.tab === "rooms" ? { rows: [], total: 0 } : result
    },
    [held, page, query]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const selection = useSelection()
  const rowIds = React.useMemo(
    () => list.rows.filter((row) => !row.deletedAt).map((row) => row.id),
    [list.rows]
  )
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "message",
    many: "messages",
    run: deletePomodoroMessages,
    keptReason: "already removed",
    selection,
    onDone: list.refresh,
  })
  const [releasing, setReleasing] = React.useState(false)
  const release = async (ids: string[]) => {
    setReleasing(true)
    try {
      const { changed, skipped } = await releasePomodoroMessages(ids)
      toast.success(
        describeBulkResult({
          done: changed.length,
          same: 0,
          kept: skipped.length,
          keptReason: "already let through or removed",
          one: "message",
          many: "messages",
          verb: "let through",
        })
      )
      selection.clear()
      await list.refresh()
    } catch (error) {
      showErrorToast(getSafetyErrorMessage(error))
    } finally {
      setReleasing(false)
    }
  }

  return (
    <>
      <AdminListTable
        title="Chat"
        icon={<MessagesSquareIcon />}
        tabs={tabs}
        noun={held ? "held messages" : "messages"}
        columns={MESSAGE_COLUMNS}
        sort="message"
        direction="desc"
        onSort={() => {}}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "messages", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            {held && selectedIds.length ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={releasing}
                onClick={() => void release(selectedIds)}
              >
                <CheckIcon className="size-4" />
                Let through ({selectedIds.length})
              </DashboardToolbarButton>
            ) : null}
            {extra}
            <DashboardToolbarSearch
              name="chat-message-search"
              aria-label="Search messages"
              placeholder="Search words, name or email…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.id} className="group" rowAction={() => onOpen(row.roomId, row.id)}>
            {row.deletedAt ? (
              <TableCell column="select" />
            ) : (
              <AdminSelectCell selection={selection} id={row.id} label={`Select the message from ${row.authorName}`} />
            )}
            <TableCell column="main">
              <button
                type="button"
                className={
                  "block max-w-[36rem] truncate text-left group-hover:underline" +
                  (row.deletedAt ? " text-muted-foreground line-through" : "")
                }
                title={row.body}
                onClick={() => onOpen(row.roomId, row.id)}
              >
                {row.body}
              </button>
              <span className="block max-w-[36rem] truncate text-xs text-muted-foreground">
                <MemberName id={row.userId} name={row.authorName} className="inline font-normal" /> in {row.roomName} · {formatDateTime(row.createdAt)}
                {row.deletedAt
                  ? row.removedBy === "admin"
                    ? " · removed by an admin"
                    : " · removed by the host"
                  : row.heldAt
                    ? " · held"
                    : ""}
              </span>
            </TableCell>
            <TableCell column="actions">
              {row.heldAt && !row.deletedAt ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Let the message from ${row.authorName} through`}
                  disabled={releasing}
                  onClick={() => void release([row.id])}
                >
                  <CheckIcon className="size-4" />
                </Button>
              ) : null}
              {row.deletedAt ? null : (
                <AdminRowDeleteButton del={del} id={row.id} label={`Delete the message from ${row.authorName}`} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "message", "messages")}?`}
        description="The room shows “Message removed” in their place. The words stay on record for reports. A held message is simply never shown."
        confirmLabel={plural(del.ids.length, "Delete message", "Delete messages")}
      />
    </>
  )
}
