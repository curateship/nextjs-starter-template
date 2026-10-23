import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { LISTING_REPORT_NOTE_MAX } from "@/lib/directory/field-lengths"
import {
  PROMOTION_REPORT_REASON_LABELS,
  PROMOTION_REPORT_REASONS,
  type PromotionReportReason,
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
import { dealsAccessFor } from "@/server/promotions/public"

/**
 * The deal page's "Report a problem" door. It is the event door in
 * `lib/api/events/reports.ts` with a deal in place of an event: the same
 * origin check, the same site from the address, the same three limits shared
 * with listing and event reports, and the same admin email. It is written
 * down in `src/app/open-endpoints.ts` with its reason.
 *
 * The deal page only opens while the Deals page is open to this visitor, so
 * the form behind it answers the same way, and a switched-off Deals page
 * takes no reports.
 */
const reportDealProblemFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      promotionId: z.string().min(1).max(36),
      reason: z.enum(PROMOTION_REPORT_REASONS),
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

    const access = await dealsAccessFor(site.id, async () =>
      Boolean(await findCurrentUser().catch(() => null))
    )
    if (!access) throw new Error("That deal is no longer on this site.")

    const input = {
      kind: "promotion" as const,
      subjectId: data.promotionId,
      reason: data.reason,
      note: data.note,
      reporterEmail: data.reporterEmail,
    }

    // Words first, counting second, writing third: a forgotten note must not
    // spend the visitor's one report.
    cleanReportInput(input)

    // Counted before the deal is looked up, so the form is not an unmetered
    // way to ask whether an id is a published deal on this site.
    await countReportAttempt(site.id, requestIp(), input)

    const { subjectTitle } = await createReport(site.id, input)

    // After the row is written, and it never throws.
    await tellAdminsAboutReport(
      site.id,
      subjectTitle,
      PROMOTION_REPORT_REASON_LABELS[data.reason]
    )

    return { sent: true }
  })

/** Files a report about a deal. No account, and nothing on the page changes. */
export function reportDealProblem(input: {
  promotionId: string
  reason: PromotionReportReason
  note?: string
  reporterEmail?: string
}) {
  return reportDealProblemFn({ data: input })
}
