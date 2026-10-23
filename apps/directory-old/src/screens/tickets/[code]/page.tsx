import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.js"
import MapPin from "lucide-react/dist/esm/icons/map-pin.js"

import Link from "@/components/app-link"
import { TicketCheckInPanel } from "@/components/frontend/events/TicketCheckInPanel"
import { loadTicket } from "@/lib/actions/events/event-check-in-actions.server"
import { buildTicketUrl, formatCheckInCode } from "@/lib/actions/events/event-check-in-core"
import type { Metadata } from "@/lib/metadata"
import { headers } from "@/lib/request-headers"
import { buildEventLocation, extractEventContentFields, formatEventWhen } from "@/lib/utils/calendar"
import { qrCodeSvg } from "@/lib/utils/qr-code"
import { getClientIp, isRateLimited } from "@/lib/utils/rate-limit"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

// A ticket is a private link, never a search result.
export const metadata: Metadata = {
  title: "Your ticket",
  robots: { index: false, follow: false },
}

const TICKET_WINDOW_MS = 60_000
const TICKET_MAX_REQUESTS = 30

function TicketNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-foreground">This ticket link is not available</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may be mistyped, or the registration may have been removed. Check the confirmation
        email you were sent, or contact the organizer.
      </p>
    </main>
  )
}

/**
 * One attendee's ticket: the QR an organizer scans at the door, plus the event
 * details. The code in the URL is the ticket — anyone holding it can open this
 * page, which is what lets a phone camera get here straight from the QR.
 * Checking someone in still needs an organizer's admin session, so the panel
 * below is empty for everybody else.
 */
export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const ip = getClientIp(await headers()) || "unknown"
  if (isRateLimited(`ticket-page:${ip}`, TICKET_MAX_REQUESTS, TICKET_WINDOW_MS)) {
    return <TicketNotFound />
  }

  const { site } = await getSiteFromHeaders()
  if (!site?.id) return <TicketNotFound />

  const ticket = await loadTicket(site.id, code)
  if (!ticket) return <TicketNotFound />

  const fields = extractEventContentFields(ticket.eventContentBlocks)
  const when = formatEventWhen(fields.eventDate, fields.eventTime)
  const where = buildEventLocation(fields.venueName, fields.venueAddress)
  const qr = qrCodeSvg(buildTicketUrl(getSiteUrl(site), ticket.code), {
    title: `Ticket code ${formatCheckInCode(ticket.code)}`,
  })

  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ticket.status === "pending" ? "Ticket reserved" : "Your ticket"}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-card-foreground">{ticket.eventTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ticket.name}</p>

        <div
          className="mx-auto mt-6 w-full max-w-56 rounded-md bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <p className="mt-3 font-mono text-sm tracking-wider text-muted-foreground">
          {formatCheckInCode(ticket.code)}
        </p>

        {ticket.status === "pending" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Payment for this ticket has not come through yet, so it will not get you in at the door.
          </p>
        ) : (
          <TicketCheckInPanel
            code={ticket.code}
            initialCheckedInAt={ticket.checkedInAt?.toISOString() ?? null}
          />
        )}
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border bg-card p-6 text-sm">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{when || "Date to be announced"}</span>
        </div>
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{where || "Location to be announced"}</span>
        </div>
        <Link href={`/events/${ticket.eventSlug}`} className="text-sm underline underline-offset-2">
          View the event page
        </Link>
      </div>
    </main>
  )
}
