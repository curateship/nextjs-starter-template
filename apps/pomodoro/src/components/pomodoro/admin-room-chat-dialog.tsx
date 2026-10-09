import * as React from "react"
import {
  CheckIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { useSafetyActions } from "@/components/pomodoro/admin-safety-dialogs"
import {
  deletePomodoroMessages,
  getSafetyErrorMessage,
  loadPomodoroRoomChat,
  releasePomodoroMessages,
  type AdminRoomChat,
} from "@/lib/api/pomodoro/admin-safety"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * One room's whole chat (admin task 05), drawn like the room's own: oldest at
 * the top, names and times, removed lines greyed with who removed them. Each
 * line can be deleted, let through when held, and its writer warned or
 * suspended. `messageId` is a line to scroll to and mark, from a search.
 */
export function AdminRoomChatDialog({
  roomId,
  messageId,
  onClose,
  onChanged,
}: {
  roomId: string | undefined
  messageId: string | undefined
  onClose: () => void
  onChanged: () => void
}) {
  const [chat, setChat] = React.useState<AdminRoomChat | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [shownFor, setShownFor] = React.useState<string | undefined>(undefined)
  const selection = useSelection()
  // Opening another room starts fresh; closing clears nothing, so the window
  // fades out as it was.
  if (shownFor !== roomId && roomId === undefined) setShownFor(undefined)
  else if (shownFor !== roomId) {
    setShownFor(roomId)
    setChat(null)
    setError(null)
  }

  const reload = React.useCallback(async () => {
    if (!roomId) return
    try {
      setChat(await loadPomodoroRoomChat(roomId))
      setError(null)
    } catch (cause) {
      setError(getSafetyErrorMessage(cause))
    }
  }, [roomId])
  React.useEffect(() => {
    if (!roomId) return
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

  // The line a search pointed at, scrolled to once the chat has drawn.
  React.useEffect(() => {
    if (!chat || !messageId) return
    document.getElementById(`chat-line-${messageId}`)?.scrollIntoView({ block: "center" })
  }, [chat, messageId])

  const afterChange = async () => {
    await reload()
    onChanged()
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
      toast.success("Let through. The room shows it now.")
      await afterChange()
    } catch (cause) {
      showErrorToast(getSafetyErrorMessage(cause))
    } finally {
      setReleasing(false)
    }
  }

  const live = chat ? chat.messages.filter((message) => !message.deletedAt).map((message) => message.id) : []
  const ticked = live.filter((id) => selection.selected.has(id))

  return (
    <>
      <Dialog open={roomId !== undefined} onOpenChange={(open) => (open ? null : onClose())}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{chat?.room.name ?? "Room chat"}</DialogTitle>
            <DialogDescription>
              {chat
                ? `Hosted by ${chat.room.hostName}. ${chat.room.closed ? "The room has ended." : "The room is open; a change shows there within a few seconds."}`
                : "Reading the chat…"}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>
                  {chat ? `${chat.messages.length} ${plural(chat.messages.length, "message", "messages")}` : "Messages"}
                </CardTitle>
                <AdminBulkDeleteButton del={del} ids={ticked} />
              </CardHeader>
              <CardContent>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : !chat ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" /> Reading…
                  </p>
                ) : chat.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody has written anything here.</p>
                ) : (
                  <ol className="flex flex-col gap-1">
                    {chat.capped ? (
                      <li className="pb-2 text-xs text-muted-foreground">
                        The newest 500 messages. Search messages finds older ones.
                      </li>
                    ) : null}
                    {chat.messages.map((message) => {
                      const removed = Boolean(message.deletedAt)
                      return (
                        <li
                          key={message.id}
                          id={`chat-line-${message.id}`}
                          className={cn(
                            "group/line flex items-start gap-3 rounded-md px-2 py-2",
                            message.id === messageId && "bg-accent"
                          )}
                        >
                          {removed ? (
                            <span className="size-4 shrink-0" />
                          ) : (
                            <Checkbox
                              className="mt-0.5"
                              aria-label={`Select the message from ${message.authorName}`}
                              checked={selection.selected.has(message.id)}
                              onCheckedChange={() => selection.toggle(message.id)}
                            />
                          )}
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                              <span className="text-sm font-semibold text-foreground">
                                {message.broadcast ? "Pomoder" : message.authorName}
                              </span>
                              <time dateTime={new Date(message.createdAt).toISOString()}>
                                {formatDateTime(message.createdAt)}
                              </time>
                              {message.broadcast ? <Badge variant="secondary">Pinned in every live room</Badge> : null}
                              {message.heldAt && !removed ? <Badge variant="outline">Held</Badge> : null}
                              {removed ? (
                                <span>{message.removedBy === "admin" ? "Removed by an admin" : "Removed by the host"}</span>
                              ) : null}
                            </p>
                            <p className={cn("break-words text-sm", removed && "text-muted-foreground line-through")}>
                              {message.body}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center">
                            {message.heldAt && !removed ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={releasing}
                                aria-label={`Let the message from ${message.authorName} through`}
                                onClick={() => void release(message.id)}
                              >
                                <CheckIcon className="size-4" />
                              </Button>
                            ) : null}
                            {removed ? null : (
                              <AdminRowDeleteButton del={del} id={message.id} label={`Delete the message from ${message.authorName}`} />
                            )}
                            {message.broadcast ? null : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon" aria-label={`More for ${message.authorName}`}>
                                    <MoreHorizontalIcon className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => safety.warn({ id: message.userId, name: message.authorName })}>
                                    <TriangleAlertIcon className="size-4" />
                                    Warn {message.authorName}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => safety.suspend({ id: message.userId, name: message.authorName })}
                                  >
                                    <ShieldAlertIcon className="size-4" />
                                    Suspend from rooms
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "message", "messages")}?`}
        description="The room shows “Message removed” in their place. The words stay on record for reports."
        confirmLabel={plural(del.ids.length, "Delete message", "Delete messages")}
      />
      {safety.dialogs}
    </>
  )
}
