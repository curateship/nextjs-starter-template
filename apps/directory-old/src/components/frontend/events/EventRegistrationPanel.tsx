"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  confirmEventTicketCheckoutAction,
  createEventTicketCheckoutAction,
  getEventRegistrationStateAction,
  submitEventRegistrationAction,
  type EventRegistrationState,
} from "@/lib/actions/events/event-registration-actions"
import type { EventRegistrationMode } from "@/lib/actions/events/event-registration-core"

interface EventRegistrationPanelProps {
  siteId: string
  eventSlug: string
  /** Mode from the event's block content, used for the first paint. The
   *  server-checked state that arrives a moment later is authoritative. */
  initialMode: EventRegistrationMode
  /** Display-only price from the block content, e.g. "$25". */
  initialPriceLabel?: string
}

const CONFIRMED_MESSAGE = "You're registered. Check your email for the details."
const TICKET_CONFIRMED_MESSAGE = "Payment received — you're registered. Check your email for the details."

/**
 * Seats line, e.g. "12 of 30 spots left". Empty when the event has no limit, and
 * once it has started — spare seats on a finished event are not news.
 */
function seatsLabel(state: EventRegistrationState) {
  if (state.closed || state.capacity === null || state.remaining === null) return ""
  if (state.remaining === 0) return "No spots left"
  return `${state.remaining} of ${state.capacity} spots left`
}

/**
 * RSVP / buy-a-ticket panel on a public event page.
 *
 * The event page itself is cached, so seat counts and the open/closed decision
 * are always fetched from the server on mount rather than baked into the HTML.
 */
export function EventRegistrationPanel({
  siteId,
  eventSlug,
  initialMode,
  initialPriceLabel = "",
}: EventRegistrationPanelProps) {
  const [state, setState] = useState<EventRegistrationState | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [honeypot, setHoneypot] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const returnHandled = useRef(false)

  const loadState = useCallback(async () => {
    const result = await getEventRegistrationStateAction({ data: { siteId, eventSlug } })
    setState(result)
  }, [eventSlug, siteId])

  // Coming back from Stripe: confirm the ticket, then drop the query string so a
  // reload does not re-run the confirmation.
  useEffect(() => {
    if (returnHandled.current) return
    returnHandled.current = true

    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get("ticket_session")
    const cancelled = params.get("ticket_checkout") === "cancelled"

    const clearQuery = () => {
      params.delete("ticket_session")
      params.delete("ticket_checkout")
      const query = params.toString()
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`)
    }

    if (cancelled) {
      setError("Checkout was cancelled. Your spot was not reserved.")
      clearQuery()
      void loadState()
      return
    }

    if (!sessionId) {
      void loadState()
      return
    }

    setSubmitting(true)
    void confirmEventTicketCheckoutAction({ data: { siteId, sessionId } }).then((result) => {
      setSubmitting(false)
      clearQuery()
      if (result.success) setSuccessMessage(TICKET_CONFIRMED_MESSAGE)
      else setError(result.error || "We could not confirm your ticket. Please contact us.")
      void loadState()
    })
  }, [loadState, siteId])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!state) return

    setError(null)
    setSubmitting(true)

    if (state.mode === "paid") {
      const result = await createEventTicketCheckoutAction({
        data: { input: { siteId, eventSlug, name, email, honeypot } },
      })
      if (result.success && result.url) {
        window.location.href = result.url
        return
      }
      setSubmitting(false)
      setError(result.error || "Could not start checkout. Please try again.")
      void loadState()
      return
    }

    const result = await submitEventRegistrationAction({
      data: { input: { siteId, eventSlug, name, email, honeypot } },
    })
    setSubmitting(false)

    if (!result.success) {
      setError(result.error || "Something went wrong. Please try again.")
      void loadState()
      return
    }

    setSuccessMessage(result.message || CONFIRMED_MESSAGE)
    void loadState()
  }

  // Nothing to show when the owner has not turned registration on. Before the
  // state arrives, the block's own mode decides whether to reserve the frame.
  const mode = state?.mode ?? initialMode
  if (mode === "none") return null

  const priceLabel = state?.priceLabel || initialPriceLabel
  const heading = mode === "paid" ? "Get a ticket" : "RSVP"
  const submitLabel = mode === "paid"
    ? priceLabel ? `Buy a ticket — ${priceLabel}` : "Buy a ticket"
    : "Reserve my spot"

  // Why the form may be missing, in priority order. Anything other than null
  // replaces the form, so the error message is rendered separately below.
  const unavailableReason = !state
    ? null
    : state.closed
      ? "This event has already started, so registration is closed."
      : state.soldOut
        ? "This event is full. No spots are left."
        : mode === "paid" && !state.paymentReady
          ? "Tickets are not on sale yet. Please check back soon."
          : null
  const showForm = Boolean(state) && !successMessage && unavailableReason === null

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 text-left">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">{heading}</h2>
        {state && seatsLabel(state) ? (
          <span className="text-sm text-muted-foreground">{seatsLabel(state)}</span>
        ) : null}
      </div>

      {!state ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="sr-only">Loading registration</span>
        </div>
      ) : successMessage ? (
        <div className="mt-4 flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
          <p className="text-sm">{successMessage}</p>
        </div>
      ) : unavailableReason ? (
        <p className="mt-4 text-sm text-muted-foreground">{unavailableReason}</p>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="event-registration-name">Your name</Label>
            <Input
              id="event-registration-name"
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              required
              maxLength={255}
              autoComplete="name"
              placeholder="Jane Doe"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-registration-email">Email</Label>
            <Input
              id="event-registration-email"
              type="email"
              value={email}
              onChange={(changeEvent) => setEmail(changeEvent.target.value)}
              required
              maxLength={255}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          {/* Honeypot: hidden from people, tempting to bots. A filled value is dropped server-side. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
            <Label htmlFor="event-registration-website">Website</Label>
            <Input
              id="event-registration-website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(changeEvent) => setHoneypot(changeEvent.target.value)}
            />
          </div>

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </form>
      )}

      {/* With no form on screen the error still needs somewhere to appear —
          a cancelled checkout on a now-full event, for instance. */}
      {error && !showForm && !successMessage ? (
        <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
