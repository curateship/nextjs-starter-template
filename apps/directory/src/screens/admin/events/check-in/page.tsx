"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AlertCircle from "lucide-react/dist/esm/icons/circle-alert.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import QrCode from "lucide-react/dist/esm/icons/qr-code.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import Users from "lucide-react/dist/esm/icons/users.js"

import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  checkInAttendeeAction,
  checkInByCodeAction,
  getEventCheckInBoardAction,
  type EventCheckInAttendee,
  type EventCheckInEventSummary,
  type EventCheckInResult,
} from "@/lib/actions/events/event-check-in-actions"
import { formatEventWhen } from "@/lib/utils/calendar"
import { cn } from "@/lib/utils/tailwind"

/** Longest a name list stays comfortable to scroll on a phone at a door. */
const VISIBLE_ATTENDEES = 40

type Banner = { tone: "success" | "warning" | "error"; message: string }

function formatArrival(value: string | null) {
  if (!value) return ""
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/**
 * An event's date is a floating wall-clock day, so it is formatted with the
 * shared event formatter rather than a timestamp one — reading a date string as
 * UTC midnight lands the door screen on the day before the event.
 */
function eventLabel(summary: EventCheckInEventSummary) {
  return `${summary.title} · ${formatEventWhen(summary.event_date, summary.event_time) || "No date yet"}`
}

/** What the organizer should be told about a scan, in one sentence. */
function bannerFor(result: EventCheckInResult & { error: string | null }): Banner {
  if (result.error) return { tone: "error", message: result.error }

  switch (result.outcome) {
    case "checked-in":
      return { tone: "success", message: `${result.attendee_name} is checked in.` }
    case "already-checked-in":
      return {
        tone: "warning",
        message: `${result.attendee_name} was already checked in at ${formatArrival(result.checked_in_at)}.`,
      }
    case "wrong-event":
      return {
        tone: "error",
        message: `That ticket is ${result.attendee_name}'s, for "${result.event_title}" — not this event.`,
      }
    case "not-registered":
      return { tone: "error", message: `${result.attendee_name}: ${result.reason}` }
    default:
      return { tone: "error", message: "No ticket matches that code." }
  }
}

/**
 * The door screen.
 *
 * Three ways to check somebody in, because a door is not a desk: type or paste
 * the code off their ticket, find them by name when the QR will not scan, or —
 * the usual one — point a phone camera at their QR, which opens their ticket
 * page with a Check in button on it.
 */
export default function EventCheckInPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const [summaries, setSummaries] = useState<EventCheckInEventSummary[]>([])
  const [attendees, setAttendees] = useState<EventCheckInAttendee[]>([])
  const [eventId, setEventId] = useState("")
  const [query, setQuery] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checkingIn, setCheckingIn] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)

  const loadBoard = useCallback(async () => {
    if (!currentSite?.id) {
      setSummaries([])
      setAttendees([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await getEventCheckInBoardAction({
        data: { siteId: currentSite.id, eventId: eventId || undefined },
      })
      if (result.error) {
        setError(result.error)
        setSummaries([])
        setAttendees([])
        return
      }
      setSummaries(result.events)
      setAttendees(result.attendees)
      setTruncated(result.truncated)
    } catch (loadError) {
      console.error("Failed to load the check-in board:", loadError)
      setError("Could not load check-in. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [currentSite?.id, eventId, siteLoading])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  // A site switch invalidates the chosen event and everything shown about it.
  useEffect(() => {
    setEventId("")
    setQuery("")
    setBanner(null)
  }, [currentSite?.id])

  const selected = summaries.find((summary) => summary.id === eventId) || null

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return attendees
    return attendees.filter(
      (attendee) =>
        attendee.name.toLowerCase().includes(term) || attendee.email.toLowerCase().includes(term),
    )
  }, [attendees, query])

  /**
   * Record an arrival locally rather than reloading the whole board: at a door,
   * on venue wifi, a round trip between every attendee is the difference
   * between a queue moving and a queue waiting.
   */
  const applyResult = (result: EventCheckInResult & { error: string | null }) => {
    setBanner(bannerFor(result))
    if (result.outcome !== "checked-in") return

    setAttendees((current) =>
      current.map((attendee) =>
        attendee.id === result.registration_id
          ? { ...attendee, checked_in_at: result.checked_in_at }
          : attendee,
      ),
    )
    setSummaries((current) =>
      current.map((summary) =>
        summary.id === eventId
          ? { ...summary, checked_in_count: summary.checked_in_count + 1 }
          : summary,
      ),
    )
  }

  // An event has to be chosen first: it is what makes a ticket for a different
  // event get refused instead of quietly admitted.
  const handleCode = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault()
    if (!eventId || !code.trim() || submitting) return

    setSubmitting(true)
    const result = await checkInByCodeAction({ data: { scanned: code, eventId } })
    setSubmitting(false)
    applyResult(result)
    if (result.outcome === "checked-in") setCode("")
  }

  const handleAttendee = async (attendee: EventCheckInAttendee) => {
    setCheckingIn(attendee.id)
    const result = await checkInAttendeeAction({ data: { registrationId: attendee.id } })
    setCheckingIn(null)
    applyResult(result)
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Events", href: "/admin/events" }, { label: "Check-in" }]} />

          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="size-4 text-muted-foreground" />
                  Door check-in
                </CardTitle>
              </CardHeader>
              {/* grid-cols-1 rather than the default implicit column: an auto
                  track is content-sized, and the event label is long enough to
                  push the card off the side of a phone. */}
              <CardContent className="grid-cols-1 sm:grid-cols-2 sm:items-end">
                {/* An implicit grid track is floored at its content's width and
                    a grid item will not shrink below its own, so a long event
                    label pushes the card off the side of a phone unless both
                    are pinned open here. */}
                <div className="grid min-w-0 grid-cols-1 gap-2">
                  <FieldLabel
                    htmlFor="check-in-event"
                    hint="Only events that take sign-ups, or already have some, can have a door."
                  >
                    Event
                  </FieldLabel>
                  <Select value={eventId} onValueChange={(value) => { setEventId(value); setBanner(null) }}>
                    <SelectTrigger id="check-in-event" className="w-full">
                      <SelectValue placeholder={loading ? "Loading events…" : "Pick the event you are at"} />
                    </SelectTrigger>
                    <SelectContent>
                      {summaries.map((summary) => (
                        <SelectItem key={summary.id} value={summary.id}>
                          {eventLabel(summary)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-baseline gap-2">
                  {selected ? (
                    <>
                      <span className="text-2xl font-semibold tabular-nums">{selected.checked_in_count}</span>
                      <span className="text-sm text-muted-foreground">
                        of {selected.registered_count} registered have arrived
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {loading ? "Loading events…" : summaries.length ? "Pick an event to start." : "No event takes sign-ups yet."}
                    </span>
                  )}
                </div>

                {error ? (
                  <p role="alert" className="text-sm text-destructive sm:col-span-2">
                    {error}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scan or type a ticket</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Point your phone&apos;s camera at the attendee&apos;s QR code and open the link it
                  offers — their ticket opens with a Check in button on it. If the code will not
                  scan, type it in below or find them by name.
                </p>

                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleCode}>
                  <div className="grid flex-1 gap-2">
                    <FieldLabel htmlFor="check-in-code" hint="The code printed under the QR on the attendee's ticket.">
                      Ticket code
                    </FieldLabel>
                    <Input
                      id="check-in-code"
                      value={code}
                      onChange={(changeEvent) => setCode(changeEvent.target.value)}
                      placeholder="1A2B-3C4D-5E6F-7890"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      disabled={!eventId}
                      className="font-mono tracking-wider"
                    />
                  </div>
                  <Button type="submit" className="sm:self-end" disabled={submitting || !eventId || !code.trim()}>
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                    Check in
                  </Button>
                </form>

                {banner ? (
                  <p
                    role="status"
                    className={cn(
                      "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
                      banner.tone === "success" && "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
                      banner.tone === "warning" && "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
                      banner.tone === "error" && "bg-destructive/10 text-destructive",
                    )}
                  >
                    {banner.tone === "success" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    )}
                    {banner.message}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  Attendees
                  <Badge variant="secondary">{matches.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="check-in-search" hint="Use this when a QR code will not scan.">
                    Find by name or email
                  </FieldLabel>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="check-in-search"
                      value={query}
                      onChange={(changeEvent) => setQuery(changeEvent.target.value)}
                      placeholder="Jane Doe"
                      className="pl-9"
                      disabled={!eventId}
                    />
                  </div>
                </div>

                {!eventId ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Pick an event above to see who is registered.
                  </p>
                ) : loading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    <span className="sr-only">Loading attendees</span>
                  </div>
                ) : matches.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {attendees.length
                      ? "Nobody registered matches that search."
                      : "Nobody has registered for this event yet."}
                  </p>
                ) : (
                  <ScrollArea className="max-h-96">
                    <ul className="divide-y">
                      {matches.slice(0, VISIBLE_ATTENDEES).map((attendee) => (
                        <li key={attendee.id} className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{attendee.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{attendee.email}</p>
                          </div>
                          {attendee.checked_in_at ? (
                            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                              <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                              In at {formatArrival(attendee.checked_in_at)}
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => handleAttendee(attendee)}
                              disabled={checkingIn === attendee.id}
                            >
                              {checkingIn === attendee.id ? <Loader2 className="size-4 animate-spin" /> : null}
                              Check in
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}

                {eventId && matches.length > VISIBLE_ATTENDEES ? (
                  <p className="text-xs text-muted-foreground">
                    Showing the first {VISIBLE_ATTENDEES} of {matches.length}. Keep typing to narrow it down.
                  </p>
                ) : null}
                {truncated ? (
                  <p className="text-xs text-muted-foreground">
                    This event has more attendees than the screen loads at once; search finds the
                    first 1,000 by name.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </CardGroup>
        </div>
      </AdminLayout>
    </>
  )
}
