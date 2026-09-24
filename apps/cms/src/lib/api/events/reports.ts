import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { LISTING_REPORT_NOTE_MAX } from "@/lib/directory/field-lengths"
import {
  EVENT_REPORT_REASONS,
  EVENT_REPORT_REASON_LABELS,
  type EventReportReason,
} from "@/lib/directory/report-reasons"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { tellAdminsAboutReport } from "@/server/directory/notify"
import { visitorSite } from "@/server/directory/public"
import {
  cleanReportInput,
  countReportAttempt,
  createReport,
} from "@/server/directory/reports"
import { eventsAccessFor } from "@/server/events/public"

/**
 * The event page's "Report a problem" door. It is the listing door in
 * `lib/api/directory/reports.ts` with an event in place of a listing: the same
 * origin check, the same site from the address, the same three limits shared
 * with listing reports, and the same admin email. It is written down in
 * `src/app/open-endpoints.ts` with its reason.
 *
 * One addition: the Events page's own switch. The event page only opens while
 * the Events page is open to this visitor, so the form behind it answers the
 * same way, and a switched-off Events page takes no reports.
 */
const reportEventProblemFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      eventId: z.string().min(1).max(36),
      reason: z.enum(EVENT_REPORT_REASONS),
      note: z.string().max(LISTING_REPORT_NOTE_MAX).optional(),
      reporterEmail: z.string().max(255).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ sent: boolean }> => {
    // Guarded by hand because there is no guard for "anybody, but only from our
    // own pages". This is the same check every `adminPost` runs.
    requireAppOrigin()

    const site = await visitorSite()
    if (!site) throw new Error("There is no directory at this address.")

    const access = await eventsAccessFor(site.id, async () =>
      Boolean(await findCurrentUser().catch(() => null))
    )
    if (!access) throw new Error("That event is no longer on this site.")

    const input = {
      kind: "event" as const,
      subjectId: data.eventId,
      reason: data.reason,
      note: data.note,
      reporterEmail: data.reporterEmail,
    }

    // Words first, counting second, writing third, for the reason the listing
    // door gives: a forgotten note must not spend the visitor's one report.
    cleanReportInput(input)

    // Counted before the event is looked up, so the form is not an unmetered
    // way to ask whether an id is a published event on this site.
    await countReportAttempt(site.id, requestIp(), input)

    const { subjectTitle } = await createReport(site.id, input)

    // After the row is written, and it never throws.
    await tellAdminsAboutReport(
      site.id,
      subjectTitle,
      EVENT_REPORT_REASON_LABELS[data.reason]
    )

    return { sent: true }
  })

/** Files a report about an event. No account, and nothing on the page changes. */
export function reportEventProblem(input: {
  eventId: string
  reason: EventReportReason
  note?: string
  reporterEmail?: string
}) {
  return reportEventProblemFn({ data: input })
}
