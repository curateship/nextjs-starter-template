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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getSafetyErrorMessage,
  loadPomodoroWarnings,
  suspendPomodoroMembers,
  warnPomodoroMembers,
} from "@/lib/api/pomodoro/admin-safety"
import { formatDateTime } from "@/lib/format/format-time"
import { SUSPENSION_CHOICES, WARNING_STARTER } from "@/lib/pomodoro/safety"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useHeldWhileClosing } from "@/lib/pomodoro/use-held-while-closing"

/**
 * Warn and Suspend (admin task 05), the same two windows wherever they open:
 * a report row and the Chat window. See `workspace/docs/admin-safety-tools.md`.
 */

export type SafetyPerson = { id: string; name: string }
type Open = { kind: "warn" | "suspend"; person: SafetyPerson } | null

/** The two windows and the calls that open them, for one page to place. */
export function useSafetyActions(onDone?: () => void | Promise<void>) {
  const [open, setOpen] = React.useState<Open>(null)
  const close = () => setOpen(null)
  return {
    warn: (person: SafetyPerson) => setOpen({ kind: "warn", person }),
    suspend: (person: SafetyPerson) => setOpen({ kind: "suspend", person }),
    dialogs: (
      <>
        <WarnDialog person={open?.kind === "warn" ? open.person : null} onClose={close} />
        <SuspendDialog
          person={open?.kind === "suspend" ? open.person : null}
          onClose={close}
          onDone={onDone}
        />
      </>
    ),
  }
}

function WarnDialog({ person: asked, onClose }: { person: SafetyPerson | null; onClose: () => void }) {
  // Kept while the window fades out, so its title keeps the name.
  const person = useHeldWhileClosing(asked)
  const open = asked !== null
  const [message, setMessage] = React.useState(WARNING_STARTER)
  const [shownFor, setShownFor] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [past, setPast] = React.useState<{ id: string; message: string; createdAt: Date }[] | null>(null)
  const messageId = React.useId()
  const personId = open ? (person?.id ?? null) : null
  // Opening for somebody starts fresh; closing clears nothing.
  if (shownFor !== personId && personId === null) setShownFor(null)
  else if (shownFor !== personId) {
    setShownFor(personId)
    setMessage(WARNING_STARTER)
    setPast(null)
  }
  React.useEffect(() => {
    if (!personId) return
    let live = true
    loadPomodoroWarnings(personId)
      .then((rows) => {
        if (live) setPast(rows)
      })
      .catch(() => {
        if (live) setPast([])
      })
    return () => {
      live = false
    }
  }, [personId])

  const send = async () => {
    if (!person) return
    if (!message.trim()) {
      showErrorToast("Write the warning first.")
      return
    }
    setSending(true)
    try {
      const { emailed, emailProblem } = await warnPomodoroMembers([person.id], message.trim())
      toast.success(
        emailed
          ? `${person.name} has the warning in the bell and by email.`
          : `${person.name} has the warning in the bell. The email did not go out: ${emailProblem ?? "no reason given"}`
      )
      onClose()
    } catch (error) {
      showErrorToast(getSafetyErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog open={open} dirty={message !== WARNING_STARTER} busy={sending} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Warn {person?.name}</DialogTitle>
            <DialogDescription>
              They get it in the bell and by email. It never says which admin sent it.
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
                  <CardTitle>Warning</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <FieldLabel htmlFor={messageId}>What they read</FieldLabel>
                  <Textarea
                    id={messageId}
                    rows={4}
                    maxLength={500}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Earlier warnings</CardTitle>
                </CardHeader>
                <CardContent>
                  {past === null ? (
                    <p className="text-sm text-muted-foreground">Reading…</p>
                  ) : past.length ? (
                    <ul className="grid gap-3">
                      {past.map((warning) => (
                        <li key={warning.id} className="grid gap-0.5 text-sm">
                          <span className="text-xs text-muted-foreground">{formatDateTime(warning.createdAt)}</span>
                          <span>{warning.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">None. This would be the first.</p>
                  )}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Send warning
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function SuspendDialog({
  person: asked,
  onClose,
  onDone,
}: {
  person: SafetyPerson | null
  onClose: () => void
  onDone?: () => void | Promise<void>
}) {
  const person = useHeldWhileClosing(asked)
  const open = asked !== null
  const [length, setLength] = React.useState<string>("7")
  const [reason, setReason] = React.useState("")
  const [reasonInvalid, setReasonInvalid] = React.useState(false)
  const [shownFor, setShownFor] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const lengthId = React.useId()
  const reasonId = React.useId()
  const personId = open ? (person?.id ?? null) : null
  if (shownFor !== personId && personId === null) setShownFor(null)
  else if (shownFor !== personId) {
    setShownFor(personId)
    setLength("7")
    setReason("")
    setReasonInvalid(false)
  }
  const choice = SUSPENSION_CHOICES.find((item) => item.value === length) ?? SUSPENSION_CHOICES[1]

  const suspend = async () => {
    if (!person) return
    if (!reason.trim()) {
      setReasonInvalid(true)
      showErrorToast("Say why. They read it on every refusal.")
      return
    }
    setSaving(true)
    try {
      await suspendPomodoroMembers([person.id], choice.days, reason.trim())
      toast.success(
        choice.days
          ? `${person.name} cannot use rooms for ${choice.label}.`
          : `${person.name} cannot use rooms until you lift it.`
      )
      await onDone?.()
      onClose()
    } catch (error) {
      showErrorToast(getSafetyErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={reason.trim() !== ""} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Suspend {person?.name} from rooms</DialogTitle>
            <DialogDescription>
              They cannot join, open or chat in any room, and are taken out of one they are in. Their own timer, tasks and history work as normal. Lift it any time under Bans.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void suspend()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Suspension</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={lengthId}>How long</FieldLabel>
                    <Select value={length} onValueChange={setLength}>
                      <SelectTrigger id={lengthId} className="w-full sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUSPENSION_CHOICES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={reasonId}>Reason they read</FieldLabel>
                    <Input
                      id={reasonId}
                      maxLength={300}
                      value={reason}
                      placeholder="Repeated abuse in room chat."
                      aria-invalid={reasonInvalid || undefined}
                      onChange={(event) => {
                        setReasonInvalid(false)
                        setReason(event.target.value)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Suspend
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
