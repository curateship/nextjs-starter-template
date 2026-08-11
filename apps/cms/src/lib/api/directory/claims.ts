import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  EDIT_REQUEST_STATUSES,
  REVIEW_STATUSES,
  type EditRequestStatus,
  type ReviewStatus,
} from "@/lib/directory/review-status"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import {
  createClaim,
  listClaims,
  listEditRequests,
  listingsOwnedBy,
  pendingClaimCount,
  pendingEditRequestCount,
  requestOwnerEdit,
  reviewClaim,
  reviewEditRequest,
  type ClaimSummary,
  type EditRequestSummary,
  type OwnedListing,
} from "@/server/directory/claims"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { tellAdminsAboutEditRequest } from "@/server/directory/notify"
import { visitorSite } from "@/server/directory/public"
import {
  directorySettingsFor,
  savedDirectorySettings,
  saveDirectorySettings,
  type DirectorySettings,
} from "@/server/directory/settings"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { describeAuthError } from "../error-message"

/**
 * Claiming a listing, owning one, and the two admin queues behind both.
 *
 * **Nothing here is open to the internet.** Claiming needs an account, so every
 * door takes a guard — `userPost` for the business asking, `adminPost` for the
 * answer. That is a deliberate difference from submissions, where the whole
 * point is that anybody may file one.
 */

export function getClaimErrorMessage(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  if (message === "RATE_LIMITED") {
    return "That is a lot of tries in a short time. Please wait a few minutes and try again."
  }
  return (
    describeAuthError(message) ??
    (message || "That could not be done. Please try again.")
  )
}

const claimClaimFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      listingId: z.string().min(1).max(36),
      contactEmail: z.string().min(3).max(255),
      claimantName: z.string().min(1).max(200),
      roleTitle: z.string().max(120).optional(),
      phone: z.string().max(60).optional(),
      message: z.string().max(1000).optional(),
      proofUrl: z.string().max(2000).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<{ sent: boolean }> => {
    // The site comes from the address being visited, never from the request —
    // otherwise somebody could claim a listing on a site they are not on.
    const site = await visitorSite()
    if (!site) throw new Error("There is no directory at this address.")

    const settings = await directorySettingsFor(site.id)
    if (!settings.claimsEnabled) {
      throw new Error("This site is not taking claims at the moment.")
    }

    await enforceRateLimit(`directory-claim:${context.user.id}`, {
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    })

    const { claim, token, listingTitle } = await createClaim(
      site.id,
      data.listingId,
      context.user.id,
      data
    )

    await sendDirectoryEmail({
      workspaceId: site.id,
      to: claim.contactEmail,
      subject: `Confirm you are with ${listingTitle}`,
      lines: [
        `Somebody asked to look after the ${listingTitle} page on ${site.name}, using this address.`,
        "Click the button to confirm the address is yours. An admin then checks the request by hand.",
        "If this was not you, ignore this email and nothing happens.",
      ],
      action: {
        label: "Confirm this address",
        url: `${site.url}/api/directory-verify?kind=claim&token=${encodeURIComponent(token)}`,
      },
    })

    return { sent: true }
  })

/** Asks for a listing and emails the business address a link to prove it. */
export function submitClaim(input: {
  listingId: string
  contactEmail: string
  claimantName: string
  roleTitle?: string
  phone?: string
  message?: string
  proofUrl?: string
}) {
  return claimClaimFn({ data: input })
}

export type ClaimsScreen = {
  claims: ClaimSummary[]
  total: number
  page: number
  pageSize: number
  waitingClaims: number
  waitingRequests: number
  requests: EditRequestSummary[]
  settings: DirectorySettings
}

const loadClaimsScreenFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      status: z.enum(REVIEW_STATUSES).optional(),
      requestStatus: z.enum(EDIT_REQUEST_STATUSES).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<ClaimsScreen> => {
    const site = await workspaceIdForRequest(context.user.id)
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1

    const [{ claims, total }, waitingClaims, waitingRequests, requests, settings] =
      await Promise.all([
        listClaims(site, {
          status: data.status,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        pendingClaimCount(site),
        pendingEditRequestCount(site),
        listEditRequests(site, { status: data.requestStatus ?? "pending" }),
        savedDirectorySettings(site),
      ])

    return {
      claims,
      total,
      page,
      pageSize,
      waitingClaims,
      waitingRequests,
      requests,
      settings,
    }
  })

export function loadClaimsScreen(input: {
  status?: ReviewStatus
  requestStatus?: EditRequestStatus
  page?: number
  limit?: number
}) {
  return loadClaimsScreenFn({ data: input })
}

const decideClaimFn = createServerFn({ method: "POST" })
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
    const result = await reviewClaim(site, data.id, {
      decision: data.decision,
      note: data.note,
      reviewerId: context.user.id,
    })

    try {
      await sendDirectoryEmail({
        workspaceId: site,
        to: result.claimantEmail,
        subject:
          data.decision === "approve"
            ? `You now look after ${result.listingTitle}`
            : `About your request for ${result.listingTitle}`,
        lines:
          data.decision === "approve"
            ? [
                `Your request for ${result.listingTitle} was approved.`,
                // **No button, deliberately.** The session cookie belongs to
                // one host, and they signed in on the site's own address — a
                // link to the deployment's address would land them signed out
                // and looking at an empty page. Told in words, they open My
                // listings where they already are.
                "Open “My listings” on the same site you signed in to, and you can suggest changes there. An admin checks each one before it goes live.",
                result.claim.reviewNote,
              ].filter(Boolean)
            : [
                `We are not able to hand you ${result.listingTitle} at the moment.`,
                result.claim.reviewNote ||
                  "If you think this is a mistake, reply to this email.",
              ],
      })
    } catch {
      // A courtesy email, not part of the decision.
    }

    return { status: result.claim.status }
  })

export function decideClaim(input: {
  id: string
  decision: "approve" | "reject"
  note?: string
}) {
  return decideClaimFn({ data: input })
}

const decideEditRequestFn = createServerFn({ method: "POST" })
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
    const result = await reviewEditRequest(site, data.id, {
      decision: data.decision,
      note: data.note,
      reviewerId: context.user.id,
    })

    try {
      await sendDirectoryEmail({
        workspaceId: site,
        to: result.ownerEmail,
        subject: `Your changes to ${result.listingTitle}`,
        lines:
          data.decision === "approve"
            ? [`Your changes to ${result.listingTitle} are live.`]
            : [
                `Your changes to ${result.listingTitle} were not applied.`,
                (data.note ?? "").trim() ||
                  "If you think this is a mistake, reply to this email.",
              ],
      })
    } catch {
      // A courtesy email, not part of the decision.
    }

    return { listingId: result.listingId }
  })

export function decideEditRequest(input: {
  id: string
  decision: "approve" | "reject"
  note?: string
}) {
  return decideEditRequestFn({ data: input })
}

const saveClaimSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      claimsEnabled: z.boolean(),
      claimButtonLabel: z.string().max(80),
      claimPendingMessage: z.string().max(300),
      claimApprovedMessage: z.string().max(300),
    })
  )
  .handler(async ({ data, context }): Promise<DirectorySettings> => {
    return saveDirectorySettings(
      await workspaceIdForRequest(context.user.id),
      data
    )
  })

/** What this site says to the public about claiming. */
export function saveClaimSettings(input: {
  claimsEnabled: boolean
  claimButtonLabel: string
  claimPendingMessage: string
  claimApprovedMessage: string
}) {
  return saveClaimSettingsFn({ data: input })
}

const loadMyListingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<OwnedListing[]> => {
    // By account, not by site: the owner area lives on the platform host, and
    // somebody may look after listings on more than one site.
    return listingsOwnedBy(context.user.id)
  })

export function loadMyListings() {
  return loadMyListingsFn()
}

const proposeListingChangeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      claimId: z.string().min(1).max(36),
      title: z.string().max(200).optional(),
      metaDescription: z.string().max(300).optional(),
      featuredImage: z.string().max(600).optional(),
      // Trees, checked by their own cleaners on the server. Anything may
      // arrive; only the allowed shapes survive.
      contactLinks: z.unknown().optional(),
      body: z.unknown().optional(),
    })
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    // **Every one of these emails the admins.** A pending request replaces the
    // one before it, so the table cannot grow — but without a limit here an
    // owner could send a hundred and put a hundred messages in somebody's
    // inbox, on the site's own sender. Generous enough that nobody editing
    // their page in good faith will ever meet it.
    await enforceRateLimit(`directory-owner-edit:${context.user.id}`, {
      maxAttempts: 20,
      windowSeconds: 60 * 60,
    })

    const { claimId, ...changes } = data
    const result = await requestOwnerEdit(context.user.id, claimId, changes)
    await tellAdminsAboutEditRequest(result.workspaceId, result.listingTitle)
    return { id: result.id }
  })

/** An owner asking for a change. Nothing reaches the public page until approved. */
export function proposeListingChange(input: {
  claimId: string
  title?: string
  metaDescription?: string
  featuredImage?: string
  contactLinks?: unknown
  body?: unknown
}) {
  return proposeListingChangeFn({ data: input })
}

export type { ClaimSummary, EditRequestSummary, OwnedListing }
