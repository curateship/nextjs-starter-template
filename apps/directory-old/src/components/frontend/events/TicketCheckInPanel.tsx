"use client"

import { useEffect, useState } from "react"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { Button } from "@/components/ui/button"
import {
  checkInByCodeAction,
  getTicketCheckInStateAction,
} from "@/lib/actions/events/event-check-in-actions"

interface TicketCheckInPanelProps {
  code: string
  initialCheckedInAt: string | null
}

function formatArrival(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * The bottom of a ticket: whether its holder has arrived, plus — for an
 * organizer, and nobody else — the button that records that they have.
 *
 * This is the path a phone camera takes. Point any phone at the QR, open the
 * link, and an organizer who is signed in to the admin lands here with one tap
 * left to make. The server action re-checks the session, so an attendee opening
 * their own ticket only ever sees the status line.
 */
export function TicketCheckInPanel({ code, initialCheckedInAt }: TicketCheckInPanelProps) {
  const [checkedInAt, setCheckedInAt] = useState(initialCheckedInAt)
  const [canCheckIn, setCanCheckIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getTicketCheckInStateAction({ data: { code } }).then((state) => {
      if (!active) return
      setCanCheckIn(state.can_check_in)
      if (state.checked_in_at) setCheckedInAt(state.checked_in_at)
    })
    return () => {
      active = false
    }
  }, [code])

  const handleCheckIn = async () => {
    setError(null)
    setSubmitting(true)
    const result = await checkInByCodeAction({ data: { scanned: code } })
    setSubmitting(false)

    if (result.checked_in_at) setCheckedInAt(result.checked_in_at)
    if (result.error) setError(result.error)
    else if (result.outcome === "not-registered") setError(result.reason)
    else if (result.outcome === "not-found") setError("This ticket is no longer valid.")
  }

  return (
    <div className="mt-4">
      {checkedInAt ? (
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4 shrink-0" />
          Checked in {formatArrival(checkedInAt)}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Show this code at the door and the organizer will scan you in.
        </p>
      )}

      {canCheckIn && !checkedInAt ? (
        <Button type="button" className="mt-4 w-full" onClick={handleCheckIn} disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Check in
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
