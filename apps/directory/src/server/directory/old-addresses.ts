import { and, eq, inArray } from "drizzle-orm"

import { LISTING_PAGE_STATUSES } from "@/lib/directory/listing-status"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  directoryGuides,
  directoryListings,
  oldAddresses,
} from "@/server/directory/schema"
import { sitePosts } from "@/server/posts/schema"

/**
 * Old addresses keep working.
 *
 * When a listing, event, post, deal or guide changes its address, the address it left
 * is kept with the one it has now. A public page asked for an address nobody
 * has looks here, and only then, and forwards with a permanent redirect.
 *
 * The admin never types a rule. The save that changes an address writes the
 * row, in the same transaction as the save, so a rename can never land without
 * its forward or the other way round.
 *
 * Three rules hold the table straight:
 *
 * - **One hop.** A row holds the address the record has today, not the one it
 *   moved to next. Renaming `joes-kitchen` to `joes-pub` moves the row that
 *   said `joes-diner → joes-kitchen` along with it.
 * - **Reuse wins.** A record that takes an address, new or renamed back, ends
 *   any forward from that address. Otherwise a new listing at `joes-diner`
 *   would send its own visitors away.
 * - **Deleting forgets.** A deleted record's old addresses go with it. Tyler's
 *   call on 17 Oct 2026: the old link shows the page-not-found page.
 */

export const OLD_ADDRESS_KINDS = [
  "listing",
  "event",
  "post",
  "promotion",
  "guide",
] as const

export type OldAddressKind = (typeof OLD_ADDRESS_KINDS)[number]

/**
 * Wraps a save that may change a record's address, and records the change.
 *
 * `readSlug` reads the address before the save and `write` does the save, both
 * inside one transaction. A save that leaves the address alone runs as it did
 * before, with no transaction and no extra read.
 */
export async function saveKeepingOldAddress<Row extends { slug: string }>(
  database: CustomShellDb,
  target: { siteId: string; kind: OldAddressKind; changesAddress: boolean },
  readSlug: (tx: CustomShellDb) => Promise<string | null>,
  write: (tx: CustomShellDb) => Promise<Row | undefined>
): Promise<Row | undefined> {
  if (!target.changesAddress) return write(database)
  return database.transaction(async (tx) => {
    const before = await readSlug(tx)
    const row = await write(tx)
    if (row && before !== null && before !== row.slug) {
      await recordAddressChange(tx, target.siteId, target.kind, before, row.slug)
    }
    return row
  })
}

/** A record moved from one address to another. Run inside the save. */
async function recordAddressChange(
  database: CustomShellDb,
  siteId: string,
  kind: OldAddressKind,
  from: string,
  to: string
): Promise<void> {
  if (from === to) return
  const at = now()
  const onSite = and(
    eq(oldAddresses.workspaceId, siteId),
    eq(oldAddresses.kind, kind)
  )

  // First, because the record now holds `to`: a forward away from it would
  // send its own visitors elsewhere, and a row pointing at it would point at
  // itself once the next statement moves it.
  await database
    .delete(oldAddresses)
    .where(and(onSite, eq(oldAddresses.oldSlug, to)))
  // Every older address that led to `from` now leads straight to `to`.
  await database
    .update(oldAddresses)
    .set({ currentSlug: to, changedAt: at })
    .where(and(onSite, eq(oldAddresses.currentSlug, from)))
  await database
    .insert(oldAddresses)
    .values({
      id: uuid(),
      workspaceId: siteId,
      kind,
      oldSlug: from,
      currentSlug: to,
      changedAt: at,
    })
    .onConflictDoUpdate({
      target: [
        oldAddresses.workspaceId,
        oldAddresses.kind,
        oldAddresses.oldSlug,
      ],
      set: { currentSlug: to, changedAt: at },
    })
}

/** A new record sits at this address, so nothing forwards away from it. */
export async function releaseAddress(
  database: CustomShellDb,
  siteId: string,
  kind: OldAddressKind,
  slugs: string[]
): Promise<void> {
  if (slugs.length === 0) return
  await database
    .delete(oldAddresses)
    .where(
      and(
        eq(oldAddresses.workspaceId, siteId),
        eq(oldAddresses.kind, kind),
        inArray(oldAddresses.oldSlug, slugs)
      )
    )
}

/** These records were deleted, and so were the old addresses leading to them. */
export async function forgetAddressesOf(
  database: CustomShellDb,
  siteId: string,
  kind: OldAddressKind,
  slugs: string[]
): Promise<void> {
  if (slugs.length === 0) return
  await database
    .delete(oldAddresses)
    .where(
      and(
        eq(oldAddresses.workspaceId, siteId),
        eq(oldAddresses.kind, kind),
        inArray(oldAddresses.currentSlug, slugs)
      )
    )
}

/**
 * Where an old address leads now, or null.
 *
 * Only asked after the page's own read found nothing, so a page that exists
 * never pays for it. The record at the far end must have a public page, asked
 * through each kind's own rule: a forward to a draft would only land on the
 * page-not-found page one hop later.
 */
export async function currentAddressFor(
  siteId: string,
  kind: OldAddressKind,
  slug: string,
  database: CustomShellDb = db
): Promise<string | null> {
  const [row] = await database
    .select({ slug: oldAddresses.currentSlug })
    .from(oldAddresses)
    .where(
      and(
        eq(oldAddresses.workspaceId, siteId),
        eq(oldAddresses.kind, kind),
        eq(oldAddresses.oldSlug, slug)
      )
    )
    .limit(1)
  if (!row) return null
  return (await pageExists(siteId, kind, row.slug, database)) ? row.slug : null
}

/**
 * Whether a record of this kind has a public page at this address.
 *
 * Events and deals are asked through their own `public.ts`, the one file
 * allowed to decide what a visitor may see of them. Loaded when needed, so
 * this file and the event and deal modules never load each other.
 */
async function pageExists(
  siteId: string,
  kind: OldAddressKind,
  slug: string,
  database: CustomShellDb
): Promise<boolean> {
  if (kind === "event") {
    const { eventPageExists } = await import("@/server/events/public")
    return eventPageExists(siteId, slug, database)
  }
  if (kind === "promotion") {
    const { dealPageExists } = await import("@/server/promotions/public")
    return dealPageExists(siteId, slug, database)
  }
  const [found] = await (kind === "listing"
    ? database
        .select({ id: directoryListings.id })
        .from(directoryListings)
        .where(
          and(
            eq(directoryListings.workspaceId, siteId),
            eq(directoryListings.slug, slug),
            inArray(directoryListings.status, [...LISTING_PAGE_STATUSES])
          )
        )
    : kind === "post"
      ? database
          .select({ id: sitePosts.id })
          .from(sitePosts)
          .where(
            and(
              eq(sitePosts.workspaceId, siteId),
              eq(sitePosts.slug, slug),
              eq(sitePosts.status, "published")
            )
          )
      : database
          .select({ id: directoryGuides.id })
          .from(directoryGuides)
          .where(
            and(
              eq(directoryGuides.workspaceId, siteId),
              eq(directoryGuides.slug, slug),
              eq(directoryGuides.status, "published")
            )
          )
  ).limit(1)
  return Boolean(found)
}
