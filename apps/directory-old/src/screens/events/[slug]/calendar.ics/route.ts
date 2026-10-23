import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import { getSitemapBaseUrl } from '@/lib/utils/sitemap'
import { buildIcsCalendar } from '@/lib/utils/calendar'
import { createIcsResponse, getEventForCalendar } from '@/lib/utils/calendar-data'
import { isValidEventSlug } from '@/lib/utils/event-slug'

// Downloadable .ics for a single event (covers Apple Calendar / Outlook).
export async function GET({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  if (!isValidEventSlug(slug)) {
    return new Response('Not found', { status: 404 })
  }

  const { success, site } = await getSiteFromHeaders()
  if (!success || !site) {
    return new Response('Not found', { status: 404 })
  }

  const baseUrl = getSitemapBaseUrl(site)
  const calendarEvent = await getEventForCalendar(site.id, slug, baseUrl)

  if (!calendarEvent) {
    return new Response('Not found', { status: 404 })
  }

  const ics = buildIcsCalendar([calendarEvent], {
    prodId: `-//${site.name}//Events//EN`,
  })

  return createIcsResponse(ics, { filename: `${slug}.ics` })
}
