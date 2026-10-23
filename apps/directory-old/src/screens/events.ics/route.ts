import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import { getSitemapBaseUrl } from '@/lib/utils/sitemap'
import { buildIcsCalendar } from '@/lib/utils/calendar'
import { createIcsResponse, getUpcomingEventsForCalendarFeed } from '@/lib/utils/calendar-data'

// Subscribe-able .ics feed of the site's upcoming published events.
export async function GET() {
  const { success, site } = await getSiteFromHeaders()
  if (!success || !site) {
    return new Response('Not found', { status: 404 })
  }

  const baseUrl = getSitemapBaseUrl(site)
  const calendarEvents = await getUpcomingEventsForCalendarFeed(site.id, baseUrl)

  const ics = buildIcsCalendar(calendarEvents, {
    prodId: `-//${site.name}//Events//EN`,
    calendarName: `${site.name} Events`,
    feed: true,
  })

  return createIcsResponse(ics)
}
