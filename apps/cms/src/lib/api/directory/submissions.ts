import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/directory/review-status"
import { requireAppOrigin } from "@/server/auth/origin"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { adminGet, adminPost } from "@/server/guards"
import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  createSubmission,
  listSubmissions,
  listingTitlesFor,
  pendingSubmissionCount,
  resendSubmissionVerification,
  reviewSubmission,
  type SubmissionSummary,
} from "@/server/directory/submissions"
import { publicCategories, visitorSite } from "@/server/directory/public"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export type { SubmissionSummary }

import { createErrorMessage, describeAuthError } from "../error-message"

/**
 * The submission form's door and the admin queue's doors.
 *
 * Two of these are open to the whole internet, which is the point of the
 * feature — a form only signed-in people can fill in is not a public form. They
 * are written down in `src/app/open-endpoints.ts` with their reasons, and each
 * one does its own checking rather than trusting the page that called it:
 *
 * - the site comes from the Host header on the server, never the request body;
 * - the POST still insists the request came from this app's own pages, the same
 *   as every guarded POST does, so another site cannot make a visitor's browser
 *   file submissions;
 * - both are rate-limited, because an open door with no limit is a way to send
 *   email from somebody else's sender.
 */

export const getSubmissionErrorMessage = createErrorMessage(
  {
    RATE_LIMITED:
      "That is a lot of tries in a short time. Please wait a few minutes and try again.",
  },
  "That could not be sent. Please try again."
)

export function getAdminSubmissionErrorMessage(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  return (
    describeAuthError(message) ??
    (message || "That could not be done. Please try again.")
  )
}

/** What the public form needs to draw itself: the site's name and its categories. */
export type SubmissionForm = {
  siteName: string
  categories: { id: string; name: string }[]
}

const readSubmissionFormFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SubmissionForm | null> => {
    const site = await visitorSite()
    if (!site) return null

    const categories = await publicCategories(site.id)
    return {
      siteName: site.name,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
    }
  }
)

/** The site's name and category list for the public "add your listing" form. */
export function loadSubmissionForm() {
  return readSubmissionFormFn()
}

const submitListingFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      businessName: z.string().min(1).max(200),
      contactEmail: z.string().min(3).max(255),
      address: z.string().max(300).optional(),
      phone: z.string().max(60).optional(),
      website: z.string().max(2000).optional(),
      description: z.string().max(2000).optional(),
      categoryIds: z.array(z.string().min(1).max(36)).max(20).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ sent: boolean }> => {
    // Guarded by hand because there is no guard for "anybody, but only from our
    // own pages". This is the same check every `adminPost` runs.
    requireAppOrigin()

    const site = await visitorSite()
    if (!site) throw new Error("There is no directory at this address.")

    // Per site and per address. A single address cannot paper the queue, and a
    // site cannot be used to send a burst of mail from its own sender.
    await enforceRateLimit(`directory-submit:${site.id}`, {
      maxAttempts: 30,
      windowSeconds: 60 * 60,
    })
    await enforceRateLimit(
      `directory-submit-email:${site.id}:${data.contactEmail.trim().toLowerCase()}`,
      { maxAttempts: 3, windowSeconds: 60 * 60 }
    )

    const { submission, token } = await createSubmission(site.id, data)

    // The link goes to the site's own address, not the deployment's: somebody
    // who filled the form in on alpha must not be sent to the platform host.
    await sendDirectoryEmail({
      workspaceId: site.id,
      to: submission.contactEmail,
      subject: `Confirm your listing for ${site.name}`,
      lines: [
        `Somebody — we hope you — asked to add ${submission.businessName} to ${site.name}.`,
        "Click the button to confirm this address. Nobody looks at the submission until you do.",
        "If this was not you, ignore this email and nothing happens.",
      ],
      action: {
        label: "Confirm my email address",
        url: `${site.url}/api/directory-verify?kind=submission&token=${encodeURIComponent(token)}`,
      },
    })

    return { sent: true }
  })

/** Files a submission and emails the sender a link to prove the address. */
export function submitListing(input: {
  businessName: string
  contactEmail: string
  address?: string
  phone?: string
  website?: string
  description?: string
  categoryIds?: string[]
}) {
  return submitListingFn({ data: input })
}

const resendSubmissionEmailFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ contactEmail: z.string().min(3).max(255) }))
  .handler(async ({ data }): Promise<{ sent: boolean }> => {
    requireAppOrigin()

    const site = await visitorSite()
    if (!site) throw new Error("There is no directory at this address.")

    await enforceRateLimit(
      `directory-resend:${site.id}:${data.contactEmail.trim().toLowerCase()}`,
      { maxAttempts: 3, windowSeconds: 60 * 60 }
    )

    const again = await resendSubmissionVerification(site.id, data.contactEmail)
    // **The same answer either way.** Saying "no submission is waiting for that
    // address" would turn this into a way of asking whether somebody has
    // submitted a listing.
    if (!again) return { sent: true }

    await sendDirectoryEmail({
      workspaceId: site.id,
      to: again.submission.contactEmail,
      subject: `Confirm your listing for ${site.name}`,
      lines: [
        `Here is a fresh link for ${again.submission.businessName}.`,
        "The last one had run out. This one lasts three days.",
      ],
      action: {
        label: "Confirm my email address",
        url: `${site.url}/api/directory-verify?kind=submission&token=${encodeURIComponent(again.token)}`,
      },
    })

    return { sent: true }
  })

/** A fresh verification link for somebody whose last one expired. */
export function resendSubmissionEmail(contactEmail: string) {
  return resendSubmissionEmailFn({ data: { contactEmail } })
}

export type SubmissionsPage = {
  submissions: SubmissionSummary[]
  total: number
  page: number
  pageSize: number
  waiting: number
  /** The listing an approved submission became, so the row can link to it. */
  listings: Record<string, { title: string; slug: string }>
}

const loadSubmissionsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      status: z.enum(REVIEW_STATUSES).optional(),
      search: z.string().max(120).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<SubmissionsPage> => {
    const site = await workspaceIdForRequest(context.user.id)
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1

    const [{ submissions, total }, waiting] = await Promise.all([
      listSubmissions(site, {
        status: data.status,
        search: data.search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      pendingSubmissionCount(site),
    ])

    const titles = await listingTitlesFor(
      site,
      submissions
        .map((submission) => submission.listingId)
        .filter((id): id is string => Boolean(id))
    )

    return {
      submissions,
      total,
      page,
      pageSize,
      waiting,
      listings: Object.fromEntries(titles),
    }
  })

export function loadSubmissionsPage(input: {
  status?: ReviewStatus
  search?: string
  page?: number
  limit?: number
}) {
  return loadSubmissionsPageFn({ data: input })
}

const reviewSubmissionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: z.string().min(1).max(36),
      decision: z.enum(["approve", "reject"]),
      note: z.string().max(500).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const site = await workspaceIdForRequest(context.user.id)
    const { submission, listingId } = await reviewSubmission(site, data.id, {
      decision: data.decision,
      note: data.note,
      reviewerId: context.user.id,
    })

    // Telling the sender is a courtesy, not part of the decision — a mail
    // server having a bad afternoon must not undo an approval that has already
    // created a listing.
    try {
      await sendDirectoryEmail({
        workspaceId: site,
        to: submission.contactEmail,
        subject:
          data.decision === "approve"
            ? `${submission.businessName} is now listed`
            : `About your listing for ${submission.businessName}`,
        lines:
          data.decision === "approve"
            ? [
                `${submission.businessName} is on the site now.`,
                submission.reviewNote,
              ].filter(Boolean)
            : [
                `We are not adding ${submission.businessName} at the moment.`,
                submission.reviewNote ||
                  "If you think this is a mistake, reply to this email.",
              ],
      })
    } catch {
      // Nothing to do about it here.
    }

    return { listingId }
  })

/** Approve — which creates the listing — or reject with a reason. */
export function decideSubmission(input: {
  id: string
  decision: "approve" | "reject"
  note?: string
}) {
  return reviewSubmissionFn({ data: input })
}

