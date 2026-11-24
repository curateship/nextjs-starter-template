import { createHash } from "node:crypto"

import { and, eq, inArray, sql, type SQL } from "drizzle-orm"

import { cleanContactLinks } from "@/lib/directory/contact-links"
import {
  listingPairKeys,
  listingPairMatch,
  MERGE_ERRORS,
  orderedPair,
  type ListingPairMatchKind,
} from "@/lib/directory/listing-duplicates"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { recordAddressChange } from "@/server/directory/old-addresses"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { directoryListingNotDuplicates, directoryListings } from "@/server/directory/schema"

/**
 * The Duplicates row of the Listings dashboard (Tyler's pick, 24 Nov 2026:
 * "Merge duplicate listings"): pairs of listings on one site that look like
 * the same place, "Not a duplicate" for a pair that is not, and Merge for one
 * that is. `lib/directory/listing-duplicates.ts` holds the rule.
 */

/** Pairs read before the rule decides them. No site has near this many. */
const CANDIDATE_LIMIT = 2000

/** The SQL twin of `duplicateNameKey`; a test holds the two together. */
const NAME_KEY = sql.raw(
  `regexp_replace(regexp_replace(regexp_replace(lower(title), '&', 'and', 'g'), '^\\s*the\\s+', ''), '[^a-z0-9]+', '', 'g')`
)
/** The SQL twin of `duplicateAddressKey`. */
const ADDRESS_KEY = sql.raw(
  `regexp_replace(lower(split_part(coalesce(contact_links->>'address', ''), ',', 1)), '[^a-z0-9]+', '', 'g')`
)
/** The SQL twin of `namesAreClose`, between `a` and `b`. */
const NAMES_CLOSE = sql.raw(
  `a.name_key <> '' AND (a.name_key = b.name_key
    OR (length(a.name_key) >= 8 AND position(a.name_key IN b.name_key) > 0)
    OR (length(b.name_key) >= 8 AND position(b.name_key IN a.name_key) > 0))`
)

/**
 * The pairs that could match, smaller id first, leaving out the ones an admin
 * said are not duplicates. Listings at one address are joined first, which
 * keeps it to a few milliseconds: comparing every name with every other took
 * 2.7 seconds on 3,333 listings, and this takes 25ms. A listing with no
 * address is compared by name with all the others, since nothing narrows it.
 */
async function candidatePairs(workspaceId: string, database: CustomShellDb): Promise<[string, string][]> {
  const result = await database.execute(sql`
    WITH site_listing AS MATERIALIZED (
      SELECT id, ${NAME_KEY} AS name_key, ${ADDRESS_KEY} AS address_key
      FROM directory_listings
      WHERE workspace_id = ${workspaceId}
    ),
    pairs AS (
      SELECT a.id AS first_id, b.id AS second_id
      FROM site_listing a
      JOIN site_listing b ON a.address_key = b.address_key AND a.id < b.id
      WHERE a.address_key <> '' AND ${NAMES_CLOSE}
      UNION
      SELECT least(a.id, b.id), greatest(a.id, b.id)
      FROM (SELECT * FROM site_listing WHERE address_key = '') a
      JOIN site_listing b ON a.id <> b.id
      WHERE ${NAMES_CLOSE}
    )
    SELECT first_id AS "firstId", second_id AS "secondId"
    FROM pairs
    WHERE NOT EXISTS (
      SELECT 1 FROM directory_listing_not_duplicates kept_apart
      WHERE kept_apart.workspace_id = ${workspaceId}
        AND kept_apart.first_listing_id = pairs.first_id
        AND kept_apart.second_listing_id = pairs.second_id
    )
    ORDER BY first_id, second_id
    LIMIT ${CANDIDATE_LIMIT}
  `)
  return (result.rows as { firstId: string; secondId: string }[]).map((row) => [row.firstId, row.secondId])
}

/** One side of a pair, with what helps decide which one to keep. */
export type DuplicateSide = {
  id: string
  title: string
  slug: string
  status: string
  featuredImage: string
  address: string
  phone: string
  website: string
  createdAt: Date
  /** The approved owner's name, or null when nobody looks after it. */
  owner: string | null
  saves: number
  events: number
  deals: number
}

export type DuplicatePair = {
  /** The two ids hashed, so the address can hold one open pair. */
  id: string
  /** The older listing, the one that was there first. */
  first: DuplicateSide
  second: DuplicateSide
  matched: ListingPairMatchKind[]
}

type PairRow = {
  id: string
  title: string
  slug: string
  status: string
  featuredImage: string
  contactLinks: unknown
  createdAt: Date
}

function pairId(a: string, b: string) {
  const [first, second] = orderedPair(a, b)
  return createHash("md5").update(`${first}:${second}`).digest("hex")
}

/** Every pair on the site the rule calls a duplicate, the older listing first, A to Z by it. */
async function decidedPairs(workspaceId: string, database: CustomShellDb) {
  const candidates = await candidatePairs(workspaceId, database)
  if (!candidates.length) return []
  const ids = [...new Set(candidates.flat())]
  const rows: PairRow[] = await database
    .select({
      id: directoryListings.id,
      title: directoryListings.title,
      slug: directoryListings.slug,
      status: directoryListings.status,
      featuredImage: directoryListings.featuredImage,
      contactLinks: directoryListings.contactLinks,
      createdAt: directoryListings.createdAt,
    })
    .from(directoryListings)
    .where(and(eq(directoryListings.workspaceId, workspaceId), inArray(directoryListings.id, ids)))
  const byId = new Map(
    rows.map((row) => {
      const links = cleanContactLinks(row.contactLinks)
      return [row.id, { row, links, keys: listingPairKeys({ title: row.title, address: links.address, menuLinks: links.menuLinks }) }]
    })
  )
  return candidates
    .flatMap(([a, b]) => {
      const one = byId.get(a)
      const two = byId.get(b)
      if (!one || !two) return []
      const matched = listingPairMatch(one.keys, two.keys)
      if (!matched.length) return []
      const [first, second] = one.row.createdAt <= two.row.createdAt ? [one, two] : [two, one]
      return [{ id: pairId(a, b), first, second, matched }]
    })
    .sort((x, y) => x.first.row.title.localeCompare(y.first.row.title) || x.id.localeCompare(y.id))
}

/** How many pairs the Duplicates row shows, for its pill. */
export async function duplicatePairCount(workspaceId: string, database: CustomShellDb = db): Promise<number> {
  return (await decidedPairs(workspaceId, database)).length
}

/** The owner, saves, events and deals of the listings on one page of pairs. */
async function sideFacts(workspaceId: string, ids: string[], database: CustomShellDb) {
  if (!ids.length) return new Map<string, { owner: string | null; saves: number; events: number; deals: number }>()
  const result = await database.execute(sql`
    SELECT listing.id,
      (SELECT claim.claimant_name FROM directory_claims claim
        WHERE claim.listing_id = listing.id AND claim.status = 'approved' LIMIT 1) AS owner,
      (SELECT count(*)::int FROM directory_save_items item WHERE item.listing_id = listing.id) AS saves,
      (SELECT count(*)::int FROM events event WHERE event.listing_id = listing.id) AS events,
      (SELECT count(*)::int FROM promotions deal WHERE deal.listing_id = listing.id) AS deals
    FROM directory_listings listing
    WHERE listing.workspace_id = ${workspaceId}
      AND listing.id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})
  `)
  return new Map(
    (result.rows as { id: string; owner: string | null; saves: number; events: number; deals: number }[]).map((row) => [
      row.id,
      { owner: row.owner, saves: Number(row.saves), events: Number(row.events), deals: Number(row.deals) },
    ])
  )
}

export type DuplicatesPage = {
  pairs: DuplicatePair[]
  total: number
  page: number
  pageSize: number
}

/** One page of pairs, narrowed to the words typed, which can be in either name. */
export async function listDuplicatePairs(
  workspaceId: string,
  options: { search?: string; page?: number; limit?: number },
  database: CustomShellDb = db
): Promise<DuplicatesPage> {
  const words = options.search?.trim().toLowerCase() ?? ""
  const all = (await decidedPairs(workspaceId, database)).filter(
    (pair) =>
      !words || pair.first.row.title.toLowerCase().includes(words) || pair.second.row.title.toLowerCase().includes(words)
  )
  const pageSize = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const page = Math.max(1, options.page ?? 1)
  const shown = all.slice((page - 1) * pageSize, page * pageSize)
  const facts = await sideFacts(
    workspaceId,
    shown.flatMap((pair) => [pair.first.row.id, pair.second.row.id]),
    database
  )
  const side = ({ row, links }: (typeof shown)[number]["first"]): DuplicateSide => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    featuredImage: row.featuredImage,
    address: links.address,
    phone: links.menuLinks.find((link) => link.type === "phone")?.value ?? "",
    website: links.menuLinks.find((link) => link.type === "website")?.value ?? "",
    createdAt: row.createdAt,
    ...(facts.get(row.id) ?? { owner: null, saves: 0, events: 0, deals: 0 }),
  })
  return {
    pairs: shown.map((pair) => ({ id: pair.id, first: side(pair.first), second: side(pair.second), matched: pair.matched })),
    total: all.length,
    page,
    pageSize,
  }
}

/** The admin looked at the pair and they are two places, so the row stops showing it. */
export async function markNotDuplicate(
  workspaceId: string,
  listingIds: [string, string],
  userId: string,
  database: CustomShellDb = db
): Promise<void> {
  const [first, second] = orderedPair(...listingIds)
  if (first === second) throw new Error(MERGE_ERRORS.same)
  const found = await database
    .select({ id: directoryListings.id })
    .from(directoryListings)
    .where(and(eq(directoryListings.workspaceId, workspaceId), inArray(directoryListings.id, [first, second])))
  if (found.length !== 2) throw new Error(MERGE_ERRORS.missing)
  await database
    .insert(directoryListingNotDuplicates)
    .values({ workspaceId, firstListingId: first, secondListingId: second, decidedByUserId: userId, createdAt: now() })
    .onConflictDoNothing()
}

/** The words a spot ended by a merge carries on the Placements row. */
export function mergedSpotNote(keptTitle: string) {
  return `Ended because its listing was merged into ${keptTitle}, which already had a longer spot. No refund.`
}

/**
 * Merges one listing into another, in one transaction, so a failure halfway
 * changes nothing.
 *
 * The kept listing keeps its own fields. It takes over everything that
 * pointed at the other one: saves, follows, events placed there, deals, guide
 * entries, reports, owner messages and requests, outreach sent, the
 * submission it came from, the listing cards in posts, and the owner's claim
 * when the kept one has none. Where both had the same thing (one saved list
 * holding both, one person following both), it is kept once.
 *
 * - **Two different owners refuse.** The admin turns one claim down first.
 * - **The same owner on both** keeps the kept listing's claim, and the other
 *   claim's featured spots and change requests move onto it before that
 *   claim goes, so nothing the owner paid for disappears with it.
 * - **Both holding a running featured spot**: the listing whose spot ends
 *   later keeps its spots, and the other's end with no refund, the rule
 *   closing a listing uses (Tyler, 17 Oct 2026,
 *   `workspace/docs/closed-listings.md`). A listing's own spots are never
 *   weighed against each other.
 * - **A payment in progress refuses**, because its checkout row may not lose
 *   its listing.
 * - **The merged listing's address forwards** to the kept one, and so does
 *   every older address that led to it. Its views stay counted under its old
 *   address, as a rename's do.
 */
export async function mergeListings(
  workspaceId: string,
  input: { keepId: string; mergeId: string },
  adminId: string,
  database: CustomShellDb = db
): Promise<{ keptId: string }> {
  const { keepId, mergeId } = input
  if (keepId === mergeId) throw new Error(MERGE_ERRORS.same)

  await database.transaction(async (tx) => {
    const run = (query: SQL) => tx.execute(query)
    // Locked, so a second admin merging the same pair waits and then finds one gone.
    const locked = await run(sql`
      SELECT id, title, slug FROM directory_listings
      WHERE workspace_id = ${workspaceId} AND id IN (${keepId}, ${mergeId})
      FOR UPDATE
    `)
    const rows = locked.rows as { id: string; title: string; slug: string }[]
    const kept = rows.find((row) => row.id === keepId)
    const gone = rows.find((row) => row.id === mergeId)
    if (!kept || !gone) throw new Error(MERGE_ERRORS.missing)

    const paying = await run(sql`
      SELECT 1 FROM directory_featured_checkouts
      WHERE workspace_id = ${workspaceId} AND listing_id IN (${keepId}, ${mergeId}) LIMIT 1
    `)
    if (paying.rows.length) throw new Error(MERGE_ERRORS.paying)

    const owners = (
      await run(sql`
        SELECT id, user_id AS "userId", listing_id AS "listingId" FROM directory_claims
        WHERE workspace_id = ${workspaceId} AND listing_id IN (${keepId}, ${mergeId}) AND status = 'approved'
      `)
    ).rows as { id: string; userId: string; listingId: string }[]
    const keptOwner = owners.find((claim) => claim.listingId === keepId)
    const goneOwner = owners.find((claim) => claim.listingId === mergeId)
    if (keptOwner && goneOwner) {
      if (keptOwner.userId !== goneOwner.userId) throw new Error(MERGE_ERRORS.owners)
      // One person owns both: their spots and change requests move to the kept claim before the other goes.
      await run(sql`UPDATE directory_featured_entitlements SET claim_id = ${keptOwner.id} WHERE claim_id = ${goneOwner.id}`)
      await run(sql`UPDATE directory_owner_edit_requests SET claim_id = ${keptOwner.id} WHERE claim_id = ${goneOwner.id}`)
      await run(sql`DELETE FROM directory_claims WHERE id = ${goneOwner.id}`)
    }

    // Each listing's running spots, read before anything moves. When both
    // had one, the listing whose spot ends later keeps its spots and the
    // other's end. A listing's own spots are never weighed against each
    // other, so one bought to start after another is left alone.
    const running = (
      await run(sql`
        SELECT id, listing_id AS "listingId", ends_at AS "endsAt" FROM directory_featured_entitlements
        WHERE workspace_id = ${workspaceId} AND listing_id IN (${keepId}, ${mergeId}) AND status = 'active' AND ends_at > now()
      `)
    ).rows as { id: string; listingId: string; endsAt: string | Date }[]
    const lastEnd = (listingId: string) =>
      Math.max(0, ...running.filter((spot) => spot.listingId === listingId).map((spot) => new Date(spot.endsAt).getTime()))
    const keptEnds = lastEnd(keepId)
    const goneEnds = lastEnd(mergeId)
    const loser = keptEnds && goneEnds ? (goneEnds > keptEnds ? keepId : mergeId) : null
    const ending = running.filter((spot) => spot.listingId === loser).map((spot) => spot.id)
    if (ending.length) {
      const at = now().toISOString()
      await run(sql`
        UPDATE directory_featured_entitlements
        SET status = 'revoked', revoked_by_user_id = ${adminId}, revoked_at = ${at}::timestamptz,
            revoke_note = ${mergedSpotNote(kept.title)}, updated_at = ${at}::timestamptz
        WHERE id IN (${sql.join(
          ending.map((id) => sql`${id}`),
          sql`, `
        )})
      `)
    }

    // Moved straight across: nothing here can be held twice.
    for (const table of [
      "directory_claims",
      "directory_featured_entitlements",
      "directory_owner_edit_requests",
      "directory_owner_messages",
      "directory_listing_reports",
      "directory_submissions",
      "events",
      "event_submissions",
      "promotions",
      "promotion_requests",
    ]) {
      await run(sql`UPDATE ${sql.identifier(table)} SET listing_id = ${keepId} WHERE listing_id = ${mergeId}`)
    }

    // Held once: a copy the kept listing already has goes, the rest move.
    const once: [table: string, by: string][] = [
      ["directory_save_items", "collection_id"],
      ["listing_follows", "user_id"],
      ["directory_guide_items", "guide_id"],
      ["directory_claim_outreach", "to_email"],
    ]
    for (const [table, by] of once) {
      const name = sql.identifier(table)
      const column = sql.identifier(by)
      await run(sql`
        DELETE FROM ${name} AS moving
        WHERE moving.listing_id = ${mergeId}
          AND EXISTS (SELECT 1 FROM ${name} AS staying WHERE staying.listing_id = ${keepId} AND staying.${column} = moving.${column})
      `)
      await run(sql`UPDATE ${name} SET listing_id = ${keepId} WHERE listing_id = ${mergeId}`)
    }

    // A post's listing card holds the listing's id and nothing else, with no
    // key to follow, so the id is swapped in the post's own text.
    await run(sql`
      UPDATE posts SET body = replace(body::text, ${mergeId}, ${keepId})::jsonb
      WHERE workspace_id = ${workspaceId} AND body::text LIKE ${`%${mergeId}%`}
    `)

    // The kept listing keeps its own categories.
    await run(sql`
      DELETE FROM category_relationships
      WHERE workspace_id = ${workspaceId} AND content_type = 'directory_listing' AND content_id = ${mergeId}
    `)
    await run(sql`DELETE FROM directory_listings WHERE id = ${mergeId}`)
    await recordAddressChange(tx, workspaceId, "listing", gone.slug, kept.slug)
  })

  clearPublicDirectoryCache(workspaceId)
  return { keptId: keepId }
}
