import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellCrmBlockedSenders } from "@/server/schema"

/**
 * The blocked list: addresses and domains whose mail must not reach the inbox.
 *
 * A pattern is either a whole address, `spam@example.com`, or a whole domain
 * written with a leading at sign, `@example.com`. Nothing else matches:
 * `@example.com` catches `anyone@example.com` and not `me@notexample.com`, and
 * `jane@buyer.com` does not catch `notjane@buyer.com`. The comparison is
 * equality on the whole address or on the whole domain, never a substring,
 * because a substring rule is how a real customer gets blocked by a pattern
 * nobody meant to aim at them.
 *
 * A subdomain is not caught either. `@example.com` leaves
 * `sales@mail.example.com` alone, because blocking a domain somebody did not
 * list is the same mistake in a different shape. Block the subdomain too if it
 * writes in.
 */

/** The longest a pattern may be, matching the column. */
export const BLOCK_PATTERN_MAX = 255

/** The longest the note beside a blocked pattern may be. */
export const BLOCK_NOTE_MAX = 500

/**
 * What somebody typed, as a pattern, or null when it is neither an address nor
 * a domain.
 *
 * Lowered and trimmed, so the capitals in `Spam@Example.com` make no
 * difference on the way in or on the way out. A bare domain typed without the
 * at sign — `example.com` — is read as the domain, because that is plainly
 * what was meant and refusing it would only be pedantry.
 */
export function normalizeBlockPattern(input: string): string | null {
  const text = input.trim().toLowerCase()
  if (!text || text.length > BLOCK_PATTERN_MAX) return null
  // No spaces, and nothing that would read as a list.
  if (/[\s,;<>]/.test(text)) return null

  if (text.startsWith("@")) {
    const domain = text.slice(1)
    return isDomain(domain) ? `@${domain}` : null
  }

  const at = text.indexOf("@")
  if (at < 0) return isDomain(text) ? `@${text}` : null

  const mailbox = text.slice(0, at)
  const domain = text.slice(at + 1)
  if (!mailbox || !isDomain(domain)) return null
  return `${mailbox}@${domain}`
}

/** A dotted name with nothing odd in it. Not a full RFC check, deliberately. */
function isDomain(value: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)
}

/**
 * The two patterns that would block this sender: the address itself, and its
 * domain.
 *
 * The whole match rule, in one place, so the lookup below cannot drift from
 * what the tests check. An address with no at sign in it can be blocked by
 * nothing, which is why the list can come back holding only the address, and
 * an empty one comes back empty rather than matching everything.
 */
export function blockCandidates(email: string): string[] {
  const address = email.trim().toLowerCase()
  if (!address) return []
  const at = address.lastIndexOf("@")
  if (at <= 0 || at === address.length - 1) return [address]
  return [address, `@${address.slice(at + 1)}`]
}

export type BlockedSenderRow = {
  id: string
  pattern: string
  note: string | null
  createdAt: Date
}

/** Everything this workspace has blocked, in the order it was blocked. */
export async function listBlockedSenders(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<BlockedSenderRow[]> {
  return database
    .select({
      id: customShellCrmBlockedSenders.id,
      pattern: customShellCrmBlockedSenders.pattern,
      note: customShellCrmBlockedSenders.note,
      createdAt: customShellCrmBlockedSenders.createdAt,
    })
    .from(customShellCrmBlockedSenders)
    .where(eq(customShellCrmBlockedSenders.workspaceId, workspaceId))
    .orderBy(asc(customShellCrmBlockedSenders.createdAt))
}

/**
 * Whether this sender is blocked here.
 *
 * One indexed lookup rather than reading the whole list and comparing in
 * JavaScript, because this runs on every piece of mail that arrives. The two
 * candidates are the address and its domain, so the query is an `IN` over the
 * unique index the migration built.
 */
export async function isSenderBlocked(
  workspaceId: string,
  email: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const candidates = blockCandidates(email)
  if (candidates.length === 0) return false

  const [match] = await database
    .select({ id: customShellCrmBlockedSenders.id })
    .from(customShellCrmBlockedSenders)
    .where(
      and(
        eq(customShellCrmBlockedSenders.workspaceId, workspaceId),
        // `lower(pattern)`, not `pattern`, so the unique index the migration
        // built on that expression is the one answering this.
        inArray(sql`lower(${customShellCrmBlockedSenders.pattern})`, candidates)
      )
    )
    .limit(1)

  return match !== undefined
}

export type BlockSenderResult =
  /** The pattern is on the list. `added` is false when it already was. */
  { blocked: true; pattern: string; added: boolean } | { blocked: false }

/**
 * Puts one address or domain on the blocked list.
 *
 * Pressing Block twice on the same sender is not an error and not a second
 * row: the second press answers `added: false`, so the screen can say "that
 * one was already blocked" instead of a refusal nobody can act on.
 */
export async function blockSender(
  workspaceId: string,
  input: string,
  note: string | null,
  database: CustomShellDb = db
): Promise<BlockSenderResult> {
  const pattern = normalizeBlockPattern(input)
  if (!pattern) return { blocked: false }

  const added = await database
    .insert(customShellCrmBlockedSenders)
    .values({
      id: uuid(),
      workspaceId,
      pattern,
      note: note?.trim() ? note.trim().slice(0, BLOCK_NOTE_MAX) : null,
      createdAt: now(),
    })
    .onConflictDoNothing()
    .returning({ id: customShellCrmBlockedSenders.id })

  return { blocked: true, pattern, added: added.length > 0 }
}

/**
 * Takes one pattern off the list, by its id.
 *
 * It does not reopen anything. Mail that was blocked stays where it was put,
 * because reopening a month of spam somebody has already dealt with is not
 * what unblocking one address is asking for.
 */
export async function unblockSender(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const removed = await database
    .delete(customShellCrmBlockedSenders)
    .where(
      and(
        eq(customShellCrmBlockedSenders.workspaceId, workspaceId),
        eq(customShellCrmBlockedSenders.id, id)
      )
    )
    .returning({ id: customShellCrmBlockedSenders.id })

  return removed.length > 0
}
