import { createHmac, timingSafeEqual } from "node:crypto"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { cleanContactLinks } from "@/lib/directory/contact-links"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import { escapeHtml } from "@/lib/email/escape-html"
import { appUrl } from "@/server/app-url"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  directoryClaimOutreach,
  directoryClaimOutreachOptOuts,
  directoryListings,
} from "@/server/directory/schema"
import { customShellWorkspaces } from "@/server/schema"
import { workspaceBaseDomain } from "@/server/workspaces/host"

export type OutreachStatus = "ready" | "sent" | "opted_out"

export type OutreachListing = {
  id: string
  title: string
  slug: string
  email: string
  status: OutreachStatus
  sentAt: Date | null
  sendStatus: "sending" | "sent" | "failed" | null
  error: string
}

export type OutreachHistoryItem = {
  id: string
  listingTitle: string
  email: string
  status: "sending" | "sent" | "failed"
  error: string
  createdAt: Date
}

function contactEmail(value: unknown) {
  const link = cleanContactLinks(value).menuLinks.find((item) => item.type === "email")
  const email = link?.value.trim().replace(/^mailto:/i, "").toLowerCase() ?? ""
  return looksLikeEmail(email) ? email : null
}

export async function outreachListings(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<OutreachListing[]> {
  const rows = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
      contactLinks: directoryListings.contactLinks,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published"),
        sql`not exists (
          select 1 from directory_claims c
          where c.listing_id = ${directoryListings.id}
            and c.workspace_id = ${workspaceId}
            and c.status = 'approved'
        )`
      )
    )
    .orderBy(asc(directoryListings.title))
    .limit(500)

  const candidates = rows
    .map((row) => ({ ...row, email: contactEmail(row.contactLinks) }))
    .filter((row): row is typeof row & { email: string } => Boolean(row.email))
  if (candidates.length === 0) return []

  const [history, optedOut] = await Promise.all([
    database
      .select()
      .from(directoryClaimOutreach)
      .where(
        and(
          eq(directoryClaimOutreach.workspaceId, workspaceId),
          inArray(
            directoryClaimOutreach.listingId,
            candidates.map((row) => row.id)
          )
        )
      ),
    database
      .select({ email: directoryClaimOutreachOptOuts.email })
      .from(directoryClaimOutreachOptOuts)
      .where(
        inArray(
          directoryClaimOutreachOptOuts.email,
          [...new Set(candidates.map((row) => row.email))]
        )
      ),
  ])
  const historyByPair = new Map(history.map((row) => [`${row.listingId}:${row.toEmail}`, row]))
  const optedOutEmails = new Set(optedOut.map((row) => row.email.toLowerCase()))

  return candidates.map((row) => {
    const sent = historyByPair.get(`${row.id}:${row.email}`)
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      email: row.email,
      status: optedOutEmails.has(row.email) ? "opted_out" : sent ? "sent" : "ready",
      sentAt: sent?.createdAt ?? null,
      sendStatus: sent?.status as OutreachListing["sendStatus"] ?? null,
      error: sent?.error ?? "",
    }
  })
}

/** The durable send record, including listings that have since been claimed. */
export async function outreachHistory(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<OutreachHistoryItem[]> {
  const rows = await database
    .select({
      id: directoryClaimOutreach.id,
      listingTitle: directoryListings.title,
      email: directoryClaimOutreach.toEmail,
      status: directoryClaimOutreach.status,
      error: directoryClaimOutreach.error,
      createdAt: directoryClaimOutreach.createdAt,
    })
    .from(directoryClaimOutreach)
    .innerJoin(directoryListings, eq(directoryListings.id, directoryClaimOutreach.listingId))
    .where(eq(directoryClaimOutreach.workspaceId, workspaceId))
    .orderBy(desc(directoryClaimOutreach.createdAt))
    .limit(200)
  return rows as OutreachHistoryItem[]
}

function signingKey() {
  const key = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  if (!key) throw new Error("ENCRYPTION_NOT_CONFIGURED")
  return key
}

function optOutToken(email: string) {
  return createHmac("sha256", signingKey())
    .update(`directory-outreach:${email.toLowerCase()}`, "utf8")
    .digest("hex")
    .slice(0, 32)
}

export function verifyOutreachOptOutToken(email: string, token: string) {
  const expected = Buffer.from(optOutToken(email), "utf8")
  const provided = Buffer.from(token, "utf8")
  return expected.length === provided.length && timingSafeEqual(expected, provided)
}

function siteUrl(site: { subdomain: string; customDomain: string | null }) {
  if (site.customDomain) return `https://${site.customDomain}`
  const base = workspaceBaseDomain()
  if (!base) return appUrl()
  const deployment = new URL(appUrl())
  const port =
    deployment.hostname === "localhost" && typeof __DEV_APP_PORT__ === "number"
      ? String(__DEV_APP_PORT__)
      : deployment.port
  return `${deployment.protocol}//${site.subdomain}.${base}${port ? `:${port}` : ""}`
}

export function buildOutreachOptOutUrl(origin: string, email: string) {
  const params = new URLSearchParams({ email, token: optOutToken(email) })
  return `${origin}/api/directory-outreach-unsubscribe?${params.toString()}`
}

export type OutreachSendResult = {
  sent: string[]
  skipped: string[]
  failed: string[]
}

/**
 * Sends one invitation per selected listing. The database row is claimed
 * before the external send, so two admins pressing Send cannot double-email.
 */
export async function sendClaimOutreach(
  workspaceId: string,
  adminId: string,
  listingIds: string[],
  database: CustomShellDb = db
): Promise<OutreachSendResult> {
  if (!process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_NOT_CONFIGURED")
  }
  const ids = [...new Set(listingIds)].slice(0, 50)
  if (ids.length === 0) throw new Error("Choose at least one listing.")

  const [site] = await database
    .select({
      id: customShellWorkspaces.id,
      name: customShellWorkspaces.name,
      subdomain: customShellWorkspaces.subdomain,
      customDomain: customShellWorkspaces.customDomain,
    })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, workspaceId))
    .limit(1)
  if (!site) throw new Error("That site no longer exists.")
  const origin = siteUrl(site)

  const rows = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
      contactLinks: directoryListings.contactLinks,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published"),
        inArray(directoryListings.id, ids),
        sql`not exists (
          select 1 from directory_claims c
          where c.listing_id = ${directoryListings.id}
            and c.workspace_id = ${workspaceId}
            and c.status = 'approved'
        )`
      )
    )
  const byId = new Map(rows.map((row) => [row.id, row]))
  const result: OutreachSendResult = { sent: [], skipped: [], failed: [] }

  for (const listingId of ids) {
    const listing = byId.get(listingId)
    const email = listing ? contactEmail(listing.contactLinks) : null
    if (!listing || !email) {
      result.skipped.push(listingId)
      continue
    }

    const [optedOut] = await database
      .select({ id: directoryClaimOutreachOptOuts.id })
      .from(directoryClaimOutreachOptOuts)
      .where(sql`lower(${directoryClaimOutreachOptOuts.email}) = ${email}`)
      .limit(1)
    if (optedOut) {
      result.skipped.push(listingId)
      continue
    }

    const at = now()
    const outreachId = uuid()
    const [claimed] = await database
      .insert(directoryClaimOutreach)
      .values({
        id: outreachId,
        workspaceId,
        listingId,
        toEmail: email,
        status: "sending",
        sentByUserId: adminId,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing()
      .returning({ id: directoryClaimOutreach.id })
    if (!claimed) {
      result.skipped.push(listingId)
      continue
    }

    // Opt-out is checked again after the send row is claimed. If it arrived in
    // the meantime, it wins and this permanent row prevents a later retry.
    const [lateOptOut] = await database
      .select({ id: directoryClaimOutreachOptOuts.id })
      .from(directoryClaimOutreachOptOuts)
      .where(sql`lower(${directoryClaimOutreachOptOuts.email}) = ${email}`)
      .limit(1)
    if (lateOptOut) {
      await database
        .update(directoryClaimOutreach)
        .set({ status: "failed", error: "The address opted out.", updatedAt: now() })
        .where(eq(directoryClaimOutreach.id, outreachId))
      result.skipped.push(listingId)
      continue
    }

    const unsubscribeUrl = buildOutreachOptOutUrl(origin, email)
    try {
      await sendDirectoryEmail(
        {
          workspaceId,
          to: email,
          subject: `Claim ${listing.title} on ${site.name}`,
          lines: [
            `${listing.title} is listed on ${site.name}, but nobody has claimed it yet.`,
            "Claiming lets the business owner keep its details accurate.",
          ],
          action: { label: `Claim ${listing.title}`, url: `${origin}/directory/${listing.slug}?claim=start` },
          unsubscribeUrl,
        },
        database
      )
      await database
        .update(directoryClaimOutreach)
        .set({ status: "sent", updatedAt: now() })
        .where(eq(directoryClaimOutreach.id, outreachId))
      result.sent.push(listingId)
    } catch (error) {
      await database
        .update(directoryClaimOutreach)
        .set({
          status: "failed",
          error: (error instanceof Error ? error.message : "The email failed.").slice(0, 500),
          updatedAt: now(),
        })
        .where(eq(directoryClaimOutreach.id, outreachId))
      result.failed.push(listingId)
    }
  }
  return result
}

export async function recordOutreachOptOut(
  email: string,
  database: CustomShellDb = db
) {
  const normalized = email.trim().toLowerCase()
  if (!looksLikeEmail(normalized)) throw new Error("INVALID_EMAIL")
  await database
    .insert(directoryClaimOutreachOptOuts)
    .values({ id: uuid(), email: normalized, createdAt: now() })
    .onConflictDoNothing()
}

function page(title: string, message: string, status: number) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:48px 20px;font-family:system-ui;background:#f4f4f5"><main style="max-width:420px;margin:auto;background:white;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center"><h1 style="font-size:20px">${escapeHtml(title)}</h1><p style="color:#4b5563">${escapeHtml(message)}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

export async function handleOutreachOptOut(
  request: Request,
  database: CustomShellDb = db
) {
  const url = new URL(request.url)
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase()
  const token = url.searchParams.get("token") ?? ""
  try {
    if (!looksLikeEmail(email) || !token || !verifyOutreachOptOutToken(email, token)) {
      return page("That link did not work", "Try the link from the most recent email.", 400)
    }
    await recordOutreachOptOut(email, database)
    return page("You are opted out", "This address will not receive another claim invitation from any site.", 200)
  } catch {
    return page("That link did not work", "Try the link from the most recent email.", 400)
  }
}
