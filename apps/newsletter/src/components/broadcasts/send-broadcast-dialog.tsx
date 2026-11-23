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
  cancelBroadcastSchedule,
  countBroadcastAudience,
  getBroadcastErrorMessage,
  scheduleBroadcastAt,
  sendBroadcastNow,
  sendTestBroadcast,
  type BroadcastDetail,
} from "@/lib/api/broadcasts"
import { describeAudienceFilter } from "@/lib/broadcasts/blocks"
import { formatSendWindows } from "@/lib/broadcasts/drip"

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

/** datetime-local value for "in roughly an hour", in the viewer's timezone. */
function defaultScheduleValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

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
  const [audienceCount, setAudienceCount] = React.useState<number | null>(null)
  const [mode, setMode] = React.useState<"now" | "schedule">("now")
  const [scheduleValue, setScheduleValue] = React.useState(
    defaultScheduleValue()
  )
  const [testEmail, setTestEmail] = React.useState("")
  const [sendingTest, setSendingTest] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Re-initialize the form whenever the dialog opens (render-time state
  // adjustment instead of a setState-in-effect).
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setError(null)
      setMode(broadcast.status === "scheduled" ? "schedule" : "now")
      if (broadcast.scheduled_at) {
        const scheduled = new Date(broadcast.scheduled_at)
        const pad = (value: number) => String(value).padStart(2, "0")
        setScheduleValue(
          `${scheduled.getFullYear()}-${pad(scheduled.getMonth() + 1)}-${pad(scheduled.getDate())}T${pad(scheduled.getHours())}:${pad(scheduled.getMinutes())}`
        )
      }
      setAudienceCount(null)
    }
  }

  React.useEffect(() => {
    if (!open) return
    let active = true
    countBroadcastAudience(broadcast.audienceFilter)
      .then((data) => {
        if (active) setAudienceCount(data.count)
      })
      .catch(() => {
        if (active) setAudienceCount(null)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const drip = broadcast.dripConfig
  const from = broadcast.fromName
    ? `${broadcast.fromName} (workspace address)`
    : "Workspace default"

  const handleSendTest = async () => {
    if (!testEmail.trim()) return
    setSendingTest(true)
    setError(null)
    try {
      const result = await sendTestBroadcast(broadcast.id, testEmail.trim())
      if (result.ok) {
        toast.success(`Test sent to ${testEmail.trim()}`)
      } else {
        setError(result.error ?? "Test send failed")
      }
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
      const updated =
        mode === "now"
          ? await sendBroadcastNow(broadcast.id)
          : await scheduleBroadcastAt(
              broadcast.id,
              new Date(scheduleValue).toISOString()
            )
      onUpdated(updated)
      onOpenChange(false)
      toast.success(
        mode === "now" ? "Broadcast is sending" : "Broadcast scheduled"
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
      const updated = await cancelBroadcastSchedule(broadcast.id)
      onUpdated(updated)
      onOpenChange(false)
      toast.success("Schedule cancelled")
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
          <DialogTitle>Review &amp; send</DialogTitle>
          <DialogDescription>
            Check the audience and delivery settings before this broadcast
            goes out.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryRow label="Subject">
                {broadcast.subject || (
                  <span className="text-destructive">Missing subject</span>
                )}
              </SummaryRow>
              <SummaryRow label="From">{from}</SummaryRow>
              <SummaryRow label="Audience">
                {describeAudienceFilter(broadcast.audienceFilter)}
                <span className="block text-xs font-normal text-muted-foreground">
                  {audienceCount === null
                    ? "Counting…"
                    : `${audienceCount.toLocaleString()} contact${audienceCount === 1 ? "" : "s"}`}
                </span>
              </SummaryRow>
              <SummaryRow label="Delivery">
                {drip.enabled ? (
                  <>
                    Drip send
                    <span className="block text-xs font-normal text-muted-foreground">
                      {drip.batchSizeMin}-{drip.batchSizeMax} per batch, every{" "}
                      {drip.intervalMinMinutes}-{drip.intervalMaxMinutes} min
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Window: {formatSendWindows(drip)} · auto-pause at{" "}
                      {drip.failureThresholdPercent}% failures
                    </span>
                  </>
                ) : (
                  "All at once"
                )}
              </SummaryRow>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Send a test first</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1">
                <Label htmlFor="send-test-email">Test address</Label>
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
                      <SelectItem value="now">Send now</SelectItem>
                      <SelectItem value="schedule">
                        Schedule for later
                      </SelectItem>
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
                      Times are in your local timezone.
                    </p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {broadcast.status === "scheduled" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleCancelSchedule()}
            >
              Cancel schedule
            </Button>
          ) : null}
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
            {mode === "now" ? "Send now" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
