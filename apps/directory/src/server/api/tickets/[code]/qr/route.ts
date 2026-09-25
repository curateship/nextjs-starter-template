import { NextRequest, NextResponse } from '@/lib/web-response'

import { loadTicket } from '@/lib/actions/events/event-check-in-actions.server'
import { buildTicketUrl } from '@/lib/actions/events/event-check-in-core'
import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { qrCodePng } from '@/lib/utils/qr-code'

// A mail client fetches this once per open, and a ticket page once per view.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 60

/**
 * GET /api/tickets/{code}/qr
 *
 * The QR image for one ticket, as a PNG — the confirmation email embeds this
 * URL, and mail clients do not render SVG.
 *
 * The code must belong to a live registration on the site this request arrived
 * on, so the endpoint cannot be used as a general-purpose QR generator and one
 * site's URL never serves another site's ticket.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const ip = getClientIp(request.headers) || 'unknown'
  if (isRateLimited(`ticket-qr:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { code } = await context.params
    const { site } = await getSiteFromHeaders()
    if (!site?.id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const ticket = await loadTicket(site.id, code)
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const png = qrCodePng(buildTicketUrl(getSiteUrl(site), ticket.code))

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        // The image never changes for a given code, but it is a bearer token —
        // only the holder's own browser or mail client may keep a copy.
        'Cache-Control': 'private, max-age=86400',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('Failed to render a ticket QR code:', error)
    return NextResponse.json({ error: 'Could not render this ticket' }, { status: 500 })
  }
}
