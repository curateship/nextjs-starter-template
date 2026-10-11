import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  countPomodoroLiveRooms,
  getSafetyErrorMessage,
  messagePomodoroLiveRooms,
} from "@/lib/api/pomodoro/admin-safety"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * One line pinned at the top of every live room's chat (admin task 05),
 * signed by the team with a STAFF label. The count is read again when the
 * window opens, so it says how many rooms it reaches now.
 */
export function MessageLiveRoomsDialog({
  open,
  liveRooms,
  onClose,
}: {
  open: boolean
  liveRooms: number
  onClose: () => void
}) {
  const [body, setBody] = React.useState("")
  const [count, setCount] = React.useState(liveRooms)
  // A failed count is said, so the number the dashboard last read is never
  // passed off as current.
  const [countFailed, setCountFailed] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const bodyId = React.useId()
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setBody("")
      setCount(liveRooms)
      setCountFailed(false)
    }
  }
  React.useEffect(() => {
    if (!open) return
    let live = true
    countPomodoroLiveRooms()
      .then((total) => {
        if (!live) return
        setCount(total)
        setCountFailed(false)
      })
      .catch(() => {
        if (live) setCountFailed(true)
      })
    return () => {
      live = false
    }
  }, [open])

  const send = async () => {
    if (!body.trim()) {
      showErrorToast("Write the message first.")
      return
    }
    // Send stays pressable (no greyed-out idle buttons), and says why nothing
    // goes. Without a count the server decides, and says the same if none.
    if (!countFailed && !count) {
      showErrorToast("No room is open right now, so there is nobody to send it to.")
      return
    }
    setSending(true)
    try {
      const { reached } = await messagePomodoroLiveRooms(body.trim())
      toast.success(
        reached
          ? `Pinned in ${reached} live ${plural(reached, "room", "rooms")}.`
          : "No room is live right now, so nothing was sent."
      )
      onClose()
    } catch (error) {
      showErrorToast(getSafetyErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog open={open} dirty={body.trim() !== ""} busy={sending} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Message live rooms</DialogTitle>
            <DialogDescription>
              {countFailed
                ? "The number of open rooms could not be loaded. It goes to every room open when you send it, pinned at the top of the chat from Pomoder with a STAFF label."
                : count
                ? `It goes to the ${count} ${plural(count, "room", "rooms")} open now, pinned at the top of the chat from Pomoder with a STAFF label, until the room ends or you delete it from that room's chat.`
                : "No room is open right now, so it would reach nobody."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Message</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <FieldLabel htmlFor={bodyId}>What every room reads</FieldLabel>
                  <Textarea
                    id={bodyId}
                    rows={3}
                    maxLength={500}
                    value={body}
                    placeholder="Pomoder will be down for ten minutes at 9pm UTC."
                    onChange={(event) => setBody(event.target.value)}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {count && !countFailed ? `Send to ${count} ${plural(count, "room", "rooms")}` : "Send"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
