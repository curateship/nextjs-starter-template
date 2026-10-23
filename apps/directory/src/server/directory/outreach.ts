import { createHmac, timingSafeEqual } from "node:crypto"
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import { cleanContactLinks } from "@/lib/directory/contact-links"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import { escapeHtml } from "@/lib/email/escape-html"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  directoryClaimOutreach,
  directoryClaimOutreachOptOuts,
  directoryListings,
} from "@/server/directory/schema"
import { directorySiteUrl } from "@/server/directory/site-url"
import { customShellWorkspaces } from "@/server/schema"

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

/**
 * The rule for pulling a listing's contact address out of its links, written
 * once in SQL so the page, the count and the search all agree.
 *
 * It is a translation of `contactEmail` above, line for line: the first link
 * whose type is `email`, among the first twenty (`cleanContactLinks` keeps no
 * more), trimmed, with any `mailto:` taken off, lowercased, and then held to
 * exactly the pattern `looksLikeEmail` uses. `[.]` rather than `\.` only so
 * the rule survives being written inside a JavaScript string unchanged.
 *
 * It has to be SQL and not JavaScript because this table pages. Working the
 * address out after the rows arrive would mean fetching every listing on the
 * site to draw fifty of them, which on a directory of three thousand is the
 * whole problem this paging exists to fix.
 */
const contactEmailSql = sql`(
  select lower(btrim(regexp_replace(btrim(link.value ->> 'value'), '^mailto:', '', 'i')))
  from jsonb_array_elements(
    case
      when jsonb_typeof(l.contact_links -> 'menuLinks') = 'array'
      then l.contact_links -> 'menuLinks'
      else '[]'::jsonb
    end
  ) with ordinality as link(value, ord)
  where link.ord <= 20 and link.value ->> 'type' = 'email'
  order by link.ord
  limit 1
)`

/** The same shape `looksLikeEmail` insists on, in Postgres' own regex dialect. */
const EMAIL_SHAPE = "^[^[:space:]@]+@[^[:space:]@.]+[.][^[:space:]@]+$"

/** One row of the ready list, as Postgres hands it back. */
type ReadyRow = {
  id: string
  title: string
  slug: string
  email: string
  sent_at: string | Date | null
  send_status: string | null
  error: string
  opted_out: boolean
  total: number
}

/** The most rows any one page may ask for, so a hand-edited address cannot ask for everything. */
const MAX_PAGE_SIZE = 200

function pageBounds(options: { limit?: number; offset?: number }) {
  return {
    limit: Math.min(Math.max(options.limit ?? 50, 1), MAX_PAGE_SIZE),
    offset: Math.max(options.offset ?? 0, 0),
  }
}

/**
 * Published listings on this site that nobody owns yet and that can be written
 * to, one page at a time.
 *
 * This used to hand back every one of them at once — on a site imported with
 * three thousand listings that is three thousand rows in one screen, under a
 * "select all" checkbox. It pages on the server now, and the count beside the
 * page controls is the real total rather than the size of the page.
 */
export async function outreachListings(
  workspaceId: string,
  options: {
    /** Matches the listing's title or its contact address. */
    search?: string
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ listings: OutreachListing[]; total: number }> {
  const { limit, offset } = pageBounds(options)
  const search = options.search?.trim()
  const pattern = search ? `%${search}%` : null

  // Written out rather than built with the query builder because of the
  // lateral join: the builder renders a bare `${column}` without its table in
  // a single-table select, which silently matches the wrong column. Every name
  // below carries its alias, so there is nothing to get wrong.
  const result = await database.execute(sql`
    with candidate as (
      select l.id, l.title, l.slug, ${contactEmailSql} as email
      from directory_listings l
      where l.workspace_id = ${workspaceId}
        and l.status = 'published'
        and not exists (
          select 1 from directory_claims c
          where c.listing_id = l.id
            and c.workspace_id = ${workspaceId}
            and c.status = 'approved'
        )
    ),
    reachable as (
      select c.* from candidate c
      where c.email is not null and c.email ~ ${EMAIL_SHAPE}
    )
    select
      r.id, r.title, r.slug, r.email,
      o.created_at as sent_at,
      o.status as send_status,
      coalesce(o.error, '') as error,
      exists (
        select 1 from directory_claim_outreach_opt_outs x
        where lower(x.email) = r.email
      ) as opted_out,
      count(*) over () as total
    from reachable r
    left join lateral (
      select h.created_at, h.status, h.error
      from directory_claim_outreach h
      where h.workspace_id = ${workspaceId}
        and h.listing_id = r.id
        and h.to_email = r.email
      order by h.created_at desc
      limit 1
    ) o on true
    where ${pattern}::text is null
       or r.title ilike ${pattern}
       or r.email ilike ${pattern}
    order by r.title asc, r.id asc
    limit ${limit} offset ${offset}
  `)

  // Both drivers this app runs on — node-postgres in the app, PGlite in the
  // tests — hand a raw query back as `{ rows, fields, affectedRows }`.
  const list = result.rows as ReadyRow[]

  // The total rides along on each row, which costs nothing — except on a page
  // that came back empty, where there is no row to read it off. That happens
  // when somebody edits `?page=` past the end, and without this the footer
  // would say "0 of 0" and offer no way back to page 1.
  const total =
    list.length > 0
      ? Number(list[0]!.total)
      : offset > 0
        ? await countReachable(workspaceId, pattern, database)
        : 0

  return {
    listings: list.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      email: row.email,
      status: row.opted_out ? "opted_out" : row.send_status ? "sent" : "ready",
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      sendStatus: (row.send_status ?? null) as OutreachListing["sendStatus"],
      error: row.error,
    })),
    total,
  }
}

/**
 * How many listings the ready list has in all, for the rare page that came back
 * empty. Deliberately the same `reachable` set as the query above it.
 */
async function countReachable(
  workspaceId: string,
  pattern: string | null,
  database: CustomShellDb
): Promise<number> {
  const result = await database.execute(sql`
    with candidate as (
      select l.id, l.title, ${contactEmailSql} as email
      from directory_listings l
      where l.workspace_id = ${workspaceId}
        and l.status = 'published'
        and not exists (
          select 1 from directory_claims c
          where c.listing_id = l.id
            and c.workspace_id = ${workspaceId}
            and c.status = 'approved'
        )
    )
    select count(*)::int as total
    from candidate c
    where c.email is not null
      and c.email ~ ${EMAIL_SHAPE}
      and (${pattern}::text is null or c.title ilike ${pattern} or c.email ilike ${pattern})
  `)

  return Number((result.rows as { total: number }[])[0]?.total ?? 0)
}


/**
 * The durable send record, one page at a time, including listings that have
 * since been claimed.
 */
export async function outreachHistory(
  workspaceId: string,
  options: {
    /** Matches the listing's title or the address written to. */
    search?: string
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ history: OutreachHistoryItem[]; total: number }> {
  const { limit, offset } = pageBounds(options)
  const search = options.search?.trim()

  // The site's own attempts, always; the search narrows what is inside that.
  const filters = [eq(directoryClaimOutreach.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(directoryListings.title, pattern),
      ilike(directoryClaimOutreach.toEmail, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select({
        id: directoryClaimOutreach.id,
        listingTitle: directoryListings.title,
        email: directoryClaimOutreach.toEmail,
        status: directoryClaimOutreach.status,
        error: directoryClaimOutreach.error,
        createdAt: directoryClaimOutreach.createdAt,
      })
      .from(directoryClaimOutreach)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, directoryClaimOutreach.listingId)
      )
      .where(where)
      .orderBy(
        desc(directoryClaimOutreach.createdAt),
        asc(directoryClaimOutreach.id)
      )
      .limit(limit)
      .offset(offset),
    // The same join as the page above it, because the search reaches the
    // listing's title. Count without it and the footer counts a different set
    // from the one on screen.
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(directoryClaimOutreach)
      .innerJoin(
        directoryListings,
        eq(directoryListings.id, directoryClaimOutreach.listingId)
      )
      .where(where),
  ])

  return {
    history: rows as OutreachHistoryItem[],
    total: countRow?.total ?? 0,
  }
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
  const origin = directorySiteUrl(site)

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
