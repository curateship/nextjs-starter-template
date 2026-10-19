import { createFileRoute } from "@tanstack/react-router"

import { DatingCalendarScreen } from "@/components/dating/dating-calendar"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadDatingCalendar } from "@/lib/api/dating/chats"
import { datingErrorMessage } from "@/lib/dating/errors"

/** The Calendar screen, under Dating in the left menu: every agreed date, and whether Google Calendar gets them too. */
export const Route = createFileRoute("/_authenticated/admin/dating_/calendar")({
  loader: () => loadDatingCalendar(),
  errorComponent: routeErrorComponent(datingErrorMessage),
  component: CalendarRoute,
})

function CalendarRoute() {
  return <DatingCalendarScreen data={Route.useLoaderData()} />
}
