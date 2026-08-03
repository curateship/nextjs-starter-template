import * as React from "react"
import { CalendarClockIcon, Loader2Icon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  cancelBroadcastScheduleSend,
  countAudience,
  getBroadcastErrorMessage,
  scheduleBroadcastSend,
  sendBroadcastNow,
  sendTestEmail,
  updateBroadcast,
  type BroadcastDetail,
} from "@/lib/api/broadcasts"
import type { BroadcastAudienceFilter } from "@/lib/broadcasts/blocks"

/** The datetime-local value for "in about an hour", in the reader's own clock. */
function defaultScheduleValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  return toLocalInputValue(date)
}

function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function SummaryRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  )
}

/**
 * The last thing between a draft and a lot of real inboxes.
 *
 * Everything irreversible is on this one screen: who it goes to and how many
 * that is, a way to send yourself a copy first, and when it goes.
 */
export function SendBroadcastDialog({
  open,
  onOpenChange,
  broadcast,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  broadcast: BroadcastDetail
  onUpdated: (broadcast: BroadcastDetail) => void
}) {
  const [audienceKind, setAudienceKind] = React.useState<"all" | "tags">(
    broadcast.audienceFilter.kind
  )
  const [tagText, setTagText] = React.useState(
    broadcast.audienceFilter.kind === "tags"
      ? broadcast.audienceFilter.tags.join(", ")
      : ""
  )
  const [audienceCount, setAudienceCount] = React.useState<{
    key: string
    total: number
  } | null>(null)
  const [mode, setMode] = React.useState<"now" | "schedule">("now")
  const [scheduleValue, setScheduleValue] = React.useState(
    defaultScheduleValue()
  )
  const [testEmail, setTestEmail] = React.useState("")
  const [sendingTest, setSendingTest] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Start the form afresh each time it opens. Done during render, which is
  // React's own answer to this, rather than a setState inside an effect.
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setError(null)
      setAudienceKind(broadcast.audienceFilter.kind)
      setTagText(
        broadcast.audienceFilter.kind === "tags"
          ? broadcast.audienceFilter.tags.join(", ")
          : ""
      )
      setMode(broadcast.status === "scheduled" ? "schedule" : "now")
      if (broadcast.scheduled_at) {
        setScheduleValue(toLocalInputValue(new Date(broadcast.scheduled_at)))
      }
      setAudienceCount(null)
    }
  }

  const tags = React.useMemo(
    () =>
      tagText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 25),
    [tagText]
  )

  const audienceFilter: BroadcastAudienceFilter = React.useMemo(
    () =>
      audienceKind === "tags" && tags.length > 0
        ? { kind: "tags", tags }
        : { kind: "all" },
    [audienceKind, tags]
  )

  // Recount whenever the chosen audience changes, so the number on screen is
  // always the number that would actually be mailed. The count is stored
  // against the audience it was counted for, so a stale number is simply not
  // shown rather than having to be cleared before each new count.
  const filterKey = JSON.stringify(audienceFilter)
  React.useEffect(() => {
    if (!open) return
    let active = true
    countAudience(JSON.parse(filterKey) as BroadcastAudienceFilter)
      .then((data) => {
        if (active) setAudienceCount({ key: filterKey, total: data.total })
      })
      .catch(() => {
        if (active) setAudienceCount(null)
      })
    return () => {
      active = false
    }
  }, [open, filterKey])

  const countedTotal =
    audienceCount?.key === filterKey ? audienceCount.total : null

  const from = broadcast.fromName
    ? `${broadcast.fromName} (workspace address)`
    : "The workspace default"

  const handleSendTest = async () => {
    if (!testEmail.trim()) return
    setSendingTest(true)
    setError(null)
    try {
      const result = await sendTestEmail(broadcast.id, testEmail.trim())
      if (result.ok) toast.success(`Test copy sent to ${testEmail.trim()}`)
      else setError(result.error ?? "The test copy did not go through")
    } catch (testError) {
      setError(getBroadcastErrorMessage(testError))
    } finally {
      setSendingTest(false)
    }
  }

  const handleConfirm = async () => {
    setBusy(true)
    setError(null)
    try {
      // Save the chosen audience before sending, so what goes out matches what
      // this screen just said it would.
      await updateBroadcast({ broadcastId: broadcast.id, audienceFilter })
      const updated =
        mode === "now"
          ? await sendBroadcastNow(broadcast.id)
          : await scheduleBroadcastSend(
              broadcast.id,
              new Date(scheduleValue).toISOString()
            )
      onUpdated(updated)
      onOpenChange(false)
      toast.success(
        mode === "now"
          ? "It is going out now. Watch the bar along the bottom."
          : "Scheduled. It goes out on its own at that time."
      )
    } catch (confirmError) {
      setError(getBroadcastErrorMessage(confirmError))
    } finally {
      setBusy(false)
    }
  }

  const handleCancelSchedule = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await cancelBroadcastScheduleSend(broadcast.id)
      onUpdated(updated)
      onOpenChange(false)
      toast.success("Back to a draft. Nothing will go out.")
    } catch (cancelError) {
      setError(getBroadcastErrorMessage(cancelError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review and send</DialogTitle>
          <DialogDescription>
            Check who this goes to before it leaves. Once it starts, the only
            way to stop it is Pause.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What goes out</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryRow label="Subject">
                {broadcast.subject || (
                  <span className="text-destructive">No subject yet</span>
                )}
              </SummaryRow>
              <SummaryRow label="From">{from}</SummaryRow>
              <SummaryRow label="Blocks">{broadcast.blocks.length}</SummaryRow>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Who gets it</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="send-audience">Audience</Label>
                  <Select
                    value={audienceKind}
                    onValueChange={(value) =>
                      setAudienceKind(value as "all" | "tags")
                    }
                  >
                    <SelectTrigger id="send-audience">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="all">Everyone on the list</SelectItem>
                      <SelectItem value="tags">Only certain tags</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {audienceKind === "tags" ? (
                  <div className="grid gap-1">
                    <Label htmlFor="send-tags">Tags</Label>
                    <Input
                      id="send-tags"
                      value={tagText}
                      placeholder="customers, beta"
                      onChange={(event) => setTagText(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate them with commas. Anyone with at least one of
                      them gets it.
                    </p>
                  </div>
                ) : null}
                <p className="text-sm">
                  {countedTotal === null
                    ? "Counting…"
                    : countedTotal === 0
                      ? "Nobody matches that yet."
                      : `${countedTotal.toLocaleString()} ${countedTotal === 1 ? "person" : "people"} will get this.`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Send yourself one first</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1">
                <Label htmlFor="send-test-email">Your address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="send-test-email"
                    type="email"
                    value={testEmail}
                    placeholder="you@example.com"
                    onChange={(event) => setTestEmail(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sendingTest || !testEmail.trim()}
                    onClick={() => void handleSendTest()}
                  >
                    {sendingTest ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : null}
                    Send test
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>When</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="send-mode">Timing</Label>
                  <Select
                    value={mode}
                    onValueChange={(value) =>
                      setMode(value as "now" | "schedule")
                    }
                  >
                    <SelectTrigger id="send-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="now">Send it now</SelectItem>
                      <SelectItem value="schedule">Send it later</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {mode === "schedule" ? (
                  <div className="grid gap-1">
                    <Label htmlFor="send-schedule-at">Send at</Label>
                    <Input
                      id="send-schedule-at"
                      type="datetime-local"
                      value={scheduleValue}
                      onChange={(event) => setScheduleValue(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      That is your own clock, not the server's.
                    </p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {error ? <ErrorBanner message={error} /> : null}
        </DialogBody>
        <DialogFooter>
          {/* Hard left, so the button that calls the whole thing off can never
              be mistaken for the one that sends it. Cancel stays directly left
              of the primary. */}
          {broadcast.status === "scheduled" ? (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={busy}
              onClick={() => void handleCancelSchedule()}
            >
              Do not send it
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || (mode === "schedule" && !scheduleValue)}
            onClick={() => void handleConfirm()}
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : mode === "now" ? (
              <SendIcon className="size-4" />
            ) : (
              <CalendarClockIcon className="size-4" />
            )}
            {mode === "now" ? "Send it now" : "Schedule it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
