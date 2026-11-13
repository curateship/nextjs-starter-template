import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  BanIcon,
  CalendarSyncIcon,
  CheckIcon,
  DoorClosedIcon,
  DoorOpenIcon,
  EllipsisVerticalIcon,
  FlagIcon,
  MailIcon,
  MailXIcon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  ShieldAlertIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UndoIcon,
} from "lucide-react"

import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { useAdminDelete, AdminDeleteConfirm } from "@/components/pomodoro/admin-delete"
import { DetailRow, ShortList } from "@/components/pomodoro/admin-member-record"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { useSafetyActions } from "@/components/pomodoro/admin-safety-dialogs"
import { PanelCard } from "@/components/shared/panel-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AdminRoomRow } from "@/lib/api/pomodoro/admin"
import { cancelPomodoroInvites } from "@/lib/api/pomodoro/admin-rooms"
import {
  deletePomodoroMessages,
  getSafetyErrorMessage,
  liftPomodoroSafety,
  loadPomodoroRoomChat,
  releasePomodoroMessages,
  type AdminRoomChat,
} from "@/lib/api/pomodoro/admin-safety"
import { getFlowflyErrorMessage, loadFlowflyRoom, type AdminRoomRecord } from "@/lib/api/pomodoro/flowfly"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { flowflyLink } from "@/lib/pomodoro/flowfly-search"
import { describeRoomRepeat } from "@/lib/pomodoro/room-repeats"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const PHASE_WORDS: Record<string, string> = {
  waiting: "Waiting",
  focus: "Focusing",
  short: "Short break",
  long: "Long break",
  scheduled: "Booked",
  closed: "Closed",
}

const REPORT_STATUS: Record<string, string> = { pending: "Waiting", resolved: "Resolved", dismissed: "Dismissed" }
const INVITE_STATUS: Record<string, string> = { queued: "Waiting to send", sent: "Sent", failed: "Failed", cancelled: "Cancelled" }

/**
 * One room on the Flowfly dashboard's right panel (Tyler's picks of 13 Nov
 * 2026: "Room holds chat+reports" and "Room bans + weekly rule"). Its chat
 * is a card here, not a tab of its own (Tyler: "we dont need this tab"):
 *
 * - **Header:** the room, its host, and the ⋮: Room settings, Feature or
 *   Unfeature, Close room, Delete room.
 * - **Body:** Details, then Chat (every line, a held line's Let through,
 *   Delete, and Warn or Suspend its writer), Reports about it, its
 *   Invitations (Cancel while waiting), Room bans (Lift), and the Weekly
 *   rule that books it.
 * - **Footer:** what the room is doing, and Close room while it is open.
 */
export function RoomRecord({
  row,
  onChanged,
  onSettings,
  onFeature,
  onClose,
  onDelete,
}: {
  row: AdminRoomRow
  onChanged: () => Promise<void>
  /** Opens the room's settings window. */
  onSettings: () => void
  onFeature: (featured: boolean) => void
  /** Asks to close the room. */
  onClose: () => void
  onDelete: () => void
}) {
  const [detail, setDetail] = React.useState<AdminRoomRecord | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const reload = React.useCallback(() => setAttempt((count) => count + 1), [])

  React.useEffect(() => {
    let live = true
    loadFlowflyRoom(row.id).then(
      (loaded) => {
        if (!live) return
        if (loaded) setDetail(loaded)
        else setError("This room is gone.")
      },
      (failure) => {
        if (live) setError(getFlowflyErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [row.id, attempt])

  const afterChange = async () => {
    reload()
    await onChanged()
  }

  const open = !row.closedAt
  return (
    <RecordFrame
      avatar={<DoorOpenIcon aria-hidden />}
      title={row.name}
      line={`Hosted by ${row.hostName} · ${row.visibility === "public" ? "Listed" : "Link only"}`}
      hideLabel="Hide the room"
      actions={
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Room menu">
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {open ? (
              <DropdownMenuItem onSelect={onSettings}>
                <SettingsIcon />
                Room settings
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onFeature(!row.featuredAt)}>
              {row.featuredAt ? <StarOffIcon /> : <StarIcon />}
              {row.featuredAt ? "Unfeature" : "Feature"}
            </DropdownMenuItem>
            {open ? (
              <DropdownMenuItem onSelect={onClose}>
                <DoorClosedIcon />
                Close room
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon />
              Delete room
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      body={
        <>
          <PanelCard storageId="pomodoro-flowfly-room-details" icon={<DoorOpenIcon />} title="Details">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              <DetailRow label="Host" value={<MemberName id={row.hostUserId} name={row.hostName} title={row.hostEmail} />} />
              <DetailRow label="Doing now" value={PHASE_WORDS[row.phase] ?? row.phase} />
              <DetailRow label="In the room" value={row.memberCount.toLocaleString()} />
              <DetailRow label="Address" value={`/${row.slug}`} />
              <DetailRow label="Shown" value={row.visibility === "public" ? "Listed" : "Link only"} />
              <DetailRow label="Featured" value={row.featuredAt ? "Yes" : "No"} />
              <DetailRow label="Opened" value={formatDateTime(row.createdAt)} />
            </div>
          </PanelCard>
          <RoomChatCard roomId={row.id} onChanged={afterChange} />
          {error ? (
            <ErrorRow
              message={error}
              onRetry={() => {
                setError(null)
                reload()
              }}
            />
          ) : !detail ? (
            <LoadingRow label="Reading the room…" />
          ) : (
            <RoomParts row={row} detail={detail} onChanged={afterChange} />
          )}
        </>
      }
      footer={
        <>
          <FooterState>
            <span className="truncate text-muted-foreground">
              {PHASE_WORDS[row.phase] ?? row.phase}
              {open ? `, ${row.memberCount} in the room` : ""}
            </span>
          </FooterState>
          {open ? (
            <Button type="button" variant="outline" onClick={onClose}>
              <DoorClosedIcon />
              Close room
            </Button>
          ) : null}
        </>
      }
    />
  )
}

/** Reports about the room, its invitations, its bans and its weekly rule. */
function RoomParts({ row, detail, onChanged }: { row: AdminRoomRow; detail: AdminRoomRecord; onChanged: () => Promise<void> }) {
  const [working, setWorking] = React.useState(false)
  const run = async (work: () => Promise<unknown>, message: (error: unknown) => string) => {
    setWorking(true)
    try {
      await work()
      await onChanged()
    } catch (error) {
      showErrorToast(message(error))
    } finally {
      setWorking(false)
    }
  }
  const waiting = detail.reports.filter((report) => report.status === "pending").length

  return (
    <>
      <PanelCard
        storageId="pomodoro-flowfly-room-reports"
        icon={<FlagIcon />}
        title="Reports"
        meta={detail.reports.length ? (waiting ? `${waiting} waiting` : String(detail.reports.length)) : undefined}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <ShortList
            empty="Nobody has reported anything here."
            rows={detail.reports.map((report) => ({
              id: report.id,
              main: report.reason,
              meta: `${REPORT_STATUS[report.status] ?? report.status} · ${report.reporterName ?? "Signed-out reader"} · ${formatDateTime(report.createdAt)}`,
            }))}
          />
          {detail.reports.length ? (
            <Button type="button" variant="ghost" size="sm" className="justify-self-start" asChild>
              <Link to="/admin/flowfly" search={flowflyLink("reports", { q: row.name })}>
                Decide them in Reports
              </Link>
            </Button>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard storageId="pomodoro-flowfly-room-invites" icon={<MailIcon />} title="Invitations" meta={detail.invites.length ? String(detail.invites.length) : undefined}>
        {detail.invites.length ? (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {detail.invites.map((invite) => (
              <li key={invite.id} className="flex min-w-0 items-center gap-2">
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm">{invite.email}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {INVITE_STATUS[invite.status] ?? invite.status} · {formatDateTime(invite.createdAt)}
                  </span>
                </span>
                {invite.status === "queued" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={working}
                    aria-label={`Cancel the invitation to ${invite.email}`}
                    onClick={() => void run(() => cancelPomodoroInvites([invite.id]), getFlowflyErrorMessage)}
                  >
                    <MailXIcon className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody was invited by email.</p>
        )}
      </PanelCard>

      <PanelCard storageId="pomodoro-flowfly-room-bans" icon={<BanIcon />} title="Room bans" meta={detail.bans.length ? String(detail.bans.length) : undefined}>
        {detail.bans.length ? (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {detail.bans.map((ban) => (
              <li key={ban.id} className="flex min-w-0 items-center gap-2">
                <span className="grid min-w-0 flex-1">
                  <MemberName id={ban.userId} name={ban.name} className="text-sm" />
                  <span className="min-w-0 truncate text-xs text-muted-foreground">Banned {formatDateTime(ban.createdAt)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={working}
                  aria-label={`Lift the ban on ${ban.name}`}
                  onClick={() => void run(() => liftPomodoroSafety("bans", [ban.id]), getSafetyErrorMessage)}
                >
                  <UndoIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody is banned from this room.</p>
        )}
      </PanelCard>

      <PanelCard storageId="pomodoro-flowfly-room-weekly" icon={<CalendarSyncIcon />} title="Weekly rule">
        {detail.weekly ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <DetailRow label="Repeats" value={`${describeRoomRepeat(detail.weekly.weekdays, detail.weekly.startMinute)} (${detail.weekly.timezone})`} />
            <DetailRow label="Booking" value={detail.weekly.stopped ? "Stopped by the host" : "Still booking"} />
            <Button type="button" variant="ghost" size="sm" className="justify-self-start" asChild>
              <Link to="/admin/flowfly" search={flowflyLink("weekly", { open: detail.weekly.id })}>
                Open the weekly room
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No weekly rule books this room.</p>
        )}
      </PanelCard>
    </>
  )
}

/**
 * The room's whole chat as a card (admin task 05), drawn like the room's
 * own: oldest at the top, names and times, removed lines greyed with who
 * removed them. A held line can be let through; each line can be deleted,
 * and its writer warned or suspended. It was the Chat page's window.
 */
function RoomChatCard({ roomId, onChanged }: { roomId: string; onChanged: () => Promise<void> }) {
  const [chat, setChat] = React.useState<AdminRoomChat | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const selection = useSelection()

  const reload = React.useCallback(async () => {
    try {
      setChat(await loadPomodoroRoomChat(roomId))
      setError(null)
    } catch (cause) {
      setError(getSafetyErrorMessage(cause))
    }
  }, [roomId])
  React.useEffect(() => {
    let live = true
    loadPomodoroRoomChat(roomId)
      .then((read) => {
        if (live) setChat(read)
      })
      .catch((cause) => {
        if (live) setError(getSafetyErrorMessage(cause))
      })
    return () => {
      live = false
    }
  }, [roomId])

  const afterChange = async () => {
    await reload()
    await onChanged()
  }
  const del = useAdminDelete({
    one: "message",
    many: "messages",
    run: deletePomodoroMessages,
    keptReason: "already removed",
    selection,
    onDone: afterChange,
  })
  const safety = useSafetyActions(afterChange)
  const [releasing, setReleasing] = React.useState(false)
  const release = async (id: string) => {
    setReleasing(true)
    try {
      await releasePomodoroMessages([id])
      await afterChange()
    } catch (cause) {
      showErrorToast(getSafetyErrorMessage(cause))
    } finally {
      setReleasing(false)
    }
  }
  const held = chat ? chat.messages.filter((message) => message.heldAt && !message.deletedAt).length : 0

  return (
    <PanelCard
      storageId="pomodoro-flowfly-room-chat"
      icon={<MessagesSquareIcon />}
      title="Chat"
      meta={chat ? (held ? `${held} held` : String(chat.messages.length)) : undefined}
    >
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !chat ? (
        <LoadingRow label="Reading the chat…" />
      ) : chat.messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has written anything here.</p>
      ) : (
        <ScrollArea className="max-h-[28rem]" viewportClassName="max-h-[28rem]">
        <ol className="flex flex-col gap-1 pr-2">
          {chat.capped ? <li className="pb-2 text-xs text-muted-foreground">The newest 500 messages.</li> : null}
          {chat.messages.map((message) => {
            const removed = Boolean(message.deletedAt)
            return (
              <li key={message.id} className="group/line flex items-start gap-2 rounded-md py-1.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="text-sm font-semibold text-foreground">{message.broadcast ? "Flowfly" : message.authorName}</span>
                    <time dateTime={new Date(message.createdAt).toISOString()}>{formatDateTime(message.createdAt)}</time>
                    {message.broadcast ? <Badge variant="secondary">Pinned in every live room</Badge> : null}
                    {message.heldAt && !removed ? <Badge variant="outline">Held</Badge> : null}
                    {removed ? <span>{message.removedBy === "admin" ? "Removed by an admin" : "Removed by the host"}</span> : null}
                  </p>
                  <p className={cn("text-sm break-words", removed && "text-muted-foreground line-through")}>{message.body}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  {message.heldAt && !removed ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={releasing}
                      aria-label={`Let the message from ${message.authorName} through`}
                      onClick={() => void release(message.id)}
                    >
                      <CheckIcon className="size-4" />
                    </Button>
                  ) : null}
                  {removed || message.broadcast ? null : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${message.authorName}'s message`}>
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => safety.warn({ id: message.userId, name: message.authorName })}>
                          <TriangleAlertIcon className="size-4" />
                          Warn {message.authorName}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => safety.suspend({ id: message.userId, name: message.authorName })}>
                          <ShieldAlertIcon className="size-4" />
                          Suspend from rooms
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => del.ask([message.id])}>
                          <Trash2Icon className="size-4" />
                          Delete the message
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        </ScrollArea>
      )}
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "message", "messages")}?`}
        description={'The room shows "Message removed" in their place. The words stay on record for reports.'}
        confirmLabel={plural(del.ids.length, "Delete message", "Delete messages")}
      />
      {safety.dialogs}
    </PanelCard>
  )
}
