import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { ErrorAlert } from "@/components/error-alert"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CALL_STATUS_LABELS,
  callStatusBadgeVariant,
  formatCallDuration,
} from "@/lib/call-format"
import { dateTimeFormatter } from "@/lib/format"
import { getCall, getCallErrorMessage, type CallItem } from "@/lib/api/calls"

// Call record modal: facts, recording player, summary, and transcript —
// same anatomy as the shell's other modals.
export function CallDetailModal({
  callId,
  onOpenChange,
}: {
  callId: string | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!callId} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Call</DialogTitle>
          <DialogDescription>
            The full record: status, recording, summary, and transcript.
          </DialogDescription>
        </DialogHeader>
        {callId ? <CallDetailContent key={callId} callId={callId} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function CallDetailContent({ callId }: { callId: string }) {
  const [call, setCall] = React.useState<CallItem | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    getCall(callId)
      .then((data) => {
        if (active) setCall(data)
      })
      .catch((loadError) => {
        if (active) setError(getCallErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [callId])

  if (error) {
    return (
      <DialogBody>
        <ErrorAlert message={error} />
      </DialogBody>
    )
  }

  if (!call) {
    return (
      <DialogBody>
        <div className="grid h-64 place-items-center">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        </div>
      </DialogBody>
    )
  }

  return (
    <DialogBody>
      {/* Who + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {call.contact_name ?? call.customer_number}
          </p>
          {call.contact_name ? (
            <p className="truncate text-sm text-muted-foreground">
              {call.customer_number}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={callStatusBadgeVariant(call.status)}>
            {CALL_STATUS_LABELS[call.status] ?? call.status}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {call.direction}
          </Badge>
          {call.agent_name ? <Badge variant="outline">{call.agent_name}</Badge> : null}
        </div>
      </div>

      {/* Facts */}
      <dl className="space-y-1.5 text-sm">
        <CallFact label="Time">
          {dateTimeFormatter.format(new Date(call.started_at ?? call.created_at))}
        </CallFact>
        {call.duration_seconds != null ? (
          <CallFact label="Duration">
            {formatCallDuration(call.duration_seconds)}
          </CallFact>
        ) : null}
        {call.cost != null ? (
          <CallFact label="Cost">${call.cost.toFixed(4)}</CallFact>
        ) : null}
        {call.campaign_name ? (
          <CallFact label="Campaign">{call.campaign_name}</CallFact>
        ) : null}
        {call.ended_reason ? (
          <CallFact label="Ended">{call.ended_reason}</CallFact>
        ) : null}
      </dl>

      {/* Recording */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Recording</p>
          <p className="text-xs text-muted-foreground">
            Audio of the full conversation.
          </p>
        </div>
        {call.recording_url ? (
          <audio controls preload="none" src={call.recording_url} className="w-full" />
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Available once the call completes.
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Summary</p>
          <p className="text-xs text-muted-foreground">
            AI-written recap of how the call went.
          </p>
        </div>
        {call.summary ? (
          <p className="text-sm whitespace-pre-wrap">{call.summary}</p>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Available once the call completes.
          </div>
        )}
      </div>

      {/* Transcript */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Transcript</p>
          <p className="text-xs text-muted-foreground">
            Word-for-word conversation log.
          </p>
        </div>
        {call.transcript ? (
          <div className="max-h-72 overflow-y-auto rounded-lg border p-3">
            <p className="text-sm whitespace-pre-wrap">{call.transcript}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Available once the call completes.
          </div>
        )}
      </div>
    </DialogBody>
  )
}

function CallFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  )
}
