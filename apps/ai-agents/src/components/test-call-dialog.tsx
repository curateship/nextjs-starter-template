import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon, PhoneIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import {
  CALL_STATUS_LABELS,
  callStatusBadgeVariant,
  formatCallDuration,
} from "@/lib/call-format"
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
  getCallErrorMessage,
  refreshCall,
  startTestCall,
  type CallItem,
} from "@/lib/api/calls"
import {
  getProviderErrorMessage,
  getProviderStatus,
  type ProviderStatus,
} from "@/lib/api/provider"

const POLL_INTERVAL_MS = 3000

// Dials one number with this agent so you can hear it before launching a
// campaign. Live status polls until the call finishes.
export function TestCallDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  agentName: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Test Call — {agentName}</DialogTitle>
          <DialogDescription>Dial one number to hear this agent live before launching a campaign.</DialogDescription>
        </DialogHeader>
        {open ? (
          <TestCallContent agentId={agentId} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TestCallContent({
  agentId,
  onClose,
}: {
  agentId: string
  onClose: () => void
}) {
  const [status, setStatus] = React.useState<ProviderStatus | null>(null)
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [phoneNumberId, setPhoneNumberId] = React.useState<string>("")
  const [customerNumber, setCustomerNumber] = React.useState("")
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [call, setCall] = React.useState<CallItem | null>(null)

  React.useEffect(() => {
    let active = true
    getProviderStatus()
      .then((data) => {
        if (!active) return
        setStatus(data)
        if (data.phone_numbers.length > 0) {
          setPhoneNumberId(data.phone_numbers[0].id)
        }
      })
      .catch((loadError) => {
        if (active) setStatusError(getProviderErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [])

  // Poll the live call until it reaches a final state.
  const callFinished = call?.status === "ended" || call?.status === "failed"
  const liveCallId = call && !callFinished ? call.id : null
  React.useEffect(() => {
    if (!liveCallId) return
    const timer = setInterval(() => {
      refreshCall(liveCallId)
        .then(setCall)
        .catch(() => {
          // Transient refresh failure — next tick retries.
        })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [liveCallId])

  async function handleStart() {
    if (!phoneNumberId || !customerNumber || starting) return
    setStarting(true)
    setError(null)
    try {
      const started = await startTestCall({ agentId, phoneNumberId, customerNumber })
      setCall(started)
    } catch (startError) {
      setError(getCallErrorMessage(startError))
    } finally {
      setStarting(false)
    }
  }

  if (statusError) {
    return (
      <DialogBody>
        <ErrorAlert message={statusError} />
      </DialogBody>
    )
  }

  if (!status) {
    return (
      <DialogBody>
        <div className="flex justify-center py-8">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      </DialogBody>
    )
  }

  // Provider prerequisites missing — explain instead of failing on dial.
  if (!status.configured || status.phone_numbers.length === 0) {
    return (
      <>
        <DialogBody>
          <div className="space-y-3 text-sm text-muted-foreground">
            {!status.configured ? (
              <p>
                The voice provider isn't connected yet, so calls can't be placed.
                Set it up under{" "}
                <Link
                  to="/admin/settings/$tab" params={{ tab: "voice-provider" }}
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={onClose}
                >
                  Voice Provider
                </Link>{" "}
                first.
              </p>
            ) : (
              <p>
                No phone numbers synced yet — outbound calls need one as the caller
                ID. Get a free number in the Vapi dashboard, then sync it under{" "}
                <Link
                  to="/admin/settings/$tab" params={{ tab: "voice-provider" }}
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={onClose}
                >
                  Voice Provider
                </Link>
                .
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    )
  }

  // A call is running (or done) — show its live state.
  if (call) {
    return (
      <>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border px-3 py-2.5">
              {!callFinished ? (
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <PhoneIcon className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{call.customer_number}</span>
              <Badge
                variant={callStatusBadgeVariant(call.status)}
                className="ml-auto"
              >
                {CALL_STATUS_LABELS[call.status] ?? call.status}
              </Badge>
            </div>
            {call.status === "failed" && call.ended_reason ? (
              <ErrorAlert message={call.ended_reason} />
            ) : null}
            {callFinished && call.duration_seconds != null ? (
              <p className="text-sm text-muted-foreground">
                Duration {formatCallDuration(call.duration_seconds)}
                {call.cost != null ? ` · $${call.cost.toFixed(4)}` : ""}
              </p>
            ) : null}
            {call.recording_url ? (
              <audio controls preload="none" src={call.recording_url} className="w-full" />
            ) : null}
            {call.summary ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                {call.summary}
              </p>
            ) : null}
            {!callFinished ? (
              <p className="text-xs text-muted-foreground">
                You can close this dialog — the call keeps going and lands in the
                Calls page.
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          {callFinished ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCall(null)
                setError(null)
              }}
            >
              New Test Call
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            {callFinished ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </>
    )
  }

  // Dial form.
  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          {error ? <ErrorAlert message={error} /> : null}
          <div className="space-y-2">
            <Label htmlFor="test-call-number">Call this number</Label>
            <Input
              id="test-call-number"
              type="tel"
              value={customerNumber}
              placeholder="+1 416 555 0123"
              autoFocus
              onChange={(event) => setCustomerNumber(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleStart()
              }}
            />
            <p className="text-xs text-muted-foreground">
              Use your own phone to hear the agent live.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-call-from">Call from</Label>
            <Select value={phoneNumberId} onValueChange={setPhoneNumberId}>
              <SelectTrigger id="test-call-from" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {status.phone_numbers.map((number) => (
                  <SelectItem key={number.id} value={number.id}>
                    {number.number}
                    {number.name ? ` — ${number.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            The agent's last saved configuration is synced to the voice provider
            and used for the call — save any edits first.
          </p>
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!customerNumber || !phoneNumberId || starting}
          onClick={handleStart}
        >
          {starting ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PhoneIcon className="size-4" />
          )}
          {starting ? "Starting" : "Start Call"}
        </Button>
      </DialogFooter>
    </>
  )
}

