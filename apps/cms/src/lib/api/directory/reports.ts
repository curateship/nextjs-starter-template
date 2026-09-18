import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { LISTING_REPORT_NOTE_MAX } from "@/lib/directory/field-lengths"
import {
  LISTING_REPORT_REASONS,
  LISTING_REPORT_REASON_LABELS,
  LISTING_REPORT_STATUSES,
  type ListingReportStatus,
} from "@/lib/directory/report-reasons"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { tellAdminsAboutListingReport } from "@/server/directory/notify"
import { visitorSite } from "@/server/directory/public"
import {
  cleanReportInput,
  closeReport,
  createReport,
  listReports,
  openReportCount,
  type ListingReportSummary,
} from "@/server/directory/reports"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { describeAuthError } from "../error-message"

/**
 * The "Report a problem" form's door, and the queue's doors behind it.
 *
 * The form is open to the whole internet, which is the point of the feature —
 * the visitor who found the bakery shut has no account and never will. So it is
 * written down in `src/app/open-endpoints.ts` with its reason, and it does its
 * own checking rather than trusting the page that called it:
 *
 * - the site comes from the Host header on the server, never the request body;
 * - the POST still insists the request came from this app's own pages, the same
 *   as every guarded POST does;
 * - three rate limits, because every report emails the admins and an open door
 *   with no limit is a way to send mail from somebody else's sender.
 *
 * The two admin doors take the ordinary guards.
 */

/**
 * The server's own words, which are sentences somebody can act on rather than
 * codes. `RATE_LIMITED` never reaches here — the handler turns each of the
 * three limits into its own sentence first, because one message for all three
 * told a visitor reporting their first listing that they had already reported
 * it.
 */
export function getListingReportErrorMessage(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  return (
    describeAuthError(message) ??
    (message || "That could not be sent. Please try again.")
  )
}

/** Counts one attempt, and says in words what this particular limit means. */
async function countAttempt(key: string, limit: number, refusal: string) {
  try {
    await enforceRateLimit(key, { maxAttempts: limit, windowSeconds: 60 * 60 })
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      throw new Error(refusal)
    }
    throw error
  }
}

const reportListingProblemFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      listingId: z.string().min(1).max(36),
      reason: z.enum(LISTING_REPORT_REASONS),
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

    // Before any counting. A visitor who forgot the note would otherwise spend
    // their one report an hour on a typo, and be refused when they came back
    // with the thing they meant to say.
    cleanReportInput(data)

    // "unknown" when a proxy hid it, and then every visitor behind that proxy
    // shares one bucket — the feature still works, it is just one report per
    // listing an hour for everybody. Stricter is the right way to fail here.
    const from = requestIp()

    // **Counted before the listing is looked up, on purpose.** Checking the
    // listing first would hand anybody an unmetered way to ask whether an id
    // is a published listing on this site, which is not something a visitor
    // can find out any other way. The cost is that somebody reporting a page
    // that was unpublished while they read it still spends one of their ten.
    //
    // One per listing per hour, which is the "sending twice in a row is
    // refused" rule said in a way the database enforces.
    await countAttempt(
      `directory-report:${site.id}:${from}:${data.listingId}`,
      1,
      "You have already sent a report about this listing. Give it a while before sending another."
    )
    // A budget across listings, so one person cannot report fifty pages.
    await countAttempt(
      `directory-report-ip:${site.id}:${from}`,
      10,
      "That is a lot of reports in a short time. Please wait an hour and try again."
    )
    // And a ceiling for the whole site, because each report is an email.
    await countAttempt(
      `directory-report-site:${site.id}`,
      50,
      "This site has had a lot of reports in the last hour. Please try again later."
    )

    const { listingTitle } = await createReport(site.id, data)

    // After the row is written, and it never throws. A report that has been
    // filed must not fail because the people who read it could not be told.
    await tellAdminsAboutListingReport(
      site.id,
      listingTitle,
      LISTING_REPORT_REASON_LABELS[data.reason]
    )

    return { sent: true }
  })

/** Files a report about a listing. No account, and nothing on the page changes. */
export function reportListingProblem(input: {
  listingId: string
  reason: (typeof LISTING_REPORT_REASONS)[number]
  note?: string
  reporterEmail?: string
}) {
  return reportListingProblemFn({ data: input })
}

export type ListingReportsPage = {
  reports: ListingReportSummary[]
  total: number
  page: number
  pageSize: number
  /** How many are still waiting, whatever the current filter shows. */
  waiting: number
}

const loadListingReportsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      status: z.enum(LISTING_REPORT_STATUSES).optional(),
      search: z.string().max(120).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<ListingReportsPage> => {
    // The site the admin is in, from their session — never from the request, so
    // the queue can only ever answer with this site's reports.
    const site = await workspaceIdForRequest(context.user.id)
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1

    const [{ reports, total }, waiting] = await Promise.all([
      listReports(site, {
        status: data.status,
        search: data.search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      openReportCount(site),
    ])

    return { reports, total, page, pageSize, waiting }
  })

export function loadListingReportsPage(input: {
  status?: ListingReportStatus
  search?: string
  page?: number
  limit?: number
}) {
  return loadListingReportsPageFn({ data: input })
}

const closeListingReportFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: z.string().min(1).max(36),
      decision: z.enum(["fixed", "dismissed"]),
    })
  )
  .handler(async ({ data, context }): Promise<void> => {
    const site = await workspaceIdForRequest(context.user.id)
    await closeReport(site, data.id, {
      decision: data.decision,
      reviewerId: context.user.id,
    })
  })

/**
 * Marks a report dealt with. Nothing is emailed to the reporter either way — a
 * report is a tip-off, not a support ticket, and the address they may have left
 * is there for an admin to use by hand.
 */
export function closeListingReport(input: {
  id: string
  decision: "fixed" | "dismissed"
}) {
  return closeListingReportFn({ data: input })
}

export type { ListingReportSummary }
