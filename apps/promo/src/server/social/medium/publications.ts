import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { mediumNameSlug } from "@/lib/social/medium/options"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { promoAccounts, promoJobs } from "../schema"
import { mediumPublication } from "./calls"
import { promoMediumPublications } from "./schema"

/**
 * The Medium publications that suit a project (part 32), and their own
 * submission rules for the AI (part 33).
 *
 * Which accounts write for a publication is read from Medium, never typed:
 * each Medium account of the project asks the publication's own data in its
 * own browser, and Medium says what that account may do there
 * (`virtuals.permissions`, measured 21 Oct 2026: `canPublish` and
 * `canSubmit` are false for somebody signed out). The rules are read from
 * the story the publication's menu links as its submission guidelines, and
 * can be pasted over by hand.
 */

/** Rules longer than this are cut; the AI is handed them whole. */
const RULES_MAX = 6_000

export type MediumPublicationView = {
  id: string
  slug: string
  name: string
  description: string
  rules: string
  rulesReadAt: Date | null
  /** The project's accounts Medium says write for it, as their handles. */
  writers: Array<{ id: string; handle: string }>
  writersReadAt: Date | null
  /** A check is waiting or running for it. */
  checking: boolean
}

export async function listMediumPublications(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<MediumPublicationView[]> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select()
    .from(promoMediumPublications)
    .where(and(eq(promoMediumPublications.userId, userId), eq(promoMediumPublications.projectId, projectId)))
    .orderBy(asc(promoMediumPublications.name), asc(promoMediumPublications.slug))
  const accounts = await db
    .select({ id: promoAccounts.id, handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "medium")))
  const jobs = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "medium_publication"), inArray(promoJobs.status, ["queued", "running"])))
  const checking = new Set(jobs.map((job) => String(job.payload?.publicationId ?? "")))
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    rules: row.rules,
    rulesReadAt: row.rulesReadAt,
    writers: row.writers.flatMap((id) => {
      const account = accounts.find((item) => item.id === id)
      return account ? [account] : []
    }),
    writersReadAt: row.writersReadAt,
    checking: checking.has(row.id),
  }))
}

/** Adds a publication to a project, by its address or its name in the address, and checks it at once. */
export async function addMediumPublication(
  userId: string,
  projectId: string,
  input: { slug: string },
  db: CustomShellDb = defaultDb
): Promise<{ id: string; checkRefused: string | null }> {
  await ownedProject(userId, projectId, db)
  const slug = mediumNameSlug(input.slug, "publication")
  if (!slug) throw new Refusal("Type the publication's address on Medium, such as medium.com/better-programming.")
  const [taken] = await db
    .select({ id: promoMediumPublications.id })
    .from(promoMediumPublications)
    .where(and(eq(promoMediumPublications.projectId, projectId), sql`lower(${promoMediumPublications.slug}) = lower(${slug})`))
    .limit(1)
  if (taken) throw new Refusal("This project already has that publication.")
  const id = uuid()
  await db.insert(promoMediumPublications).values({ id, userId, projectId, slug, name: slug })
  try {
    await queuePublicationChecks(userId, id, db)
    return { id, checkRefused: null }
  } catch (error) {
    if (error instanceof Refusal) return { id, checkRefused: error.message }
    throw error
  }
}

export async function removeMediumPublication(userId: string, publicationId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoMediumPublications)
    .where(and(eq(promoMediumPublications.id, publicationId), eq(promoMediumPublications.userId, userId)))
    .returning({ id: promoMediumPublications.id })
  if (!removed.length) throw new Error("That publication is not on the list any more.")
}

/** Rules pasted by hand, which the AI is handed in place of the ones read. */
export async function saveMediumPublicationRules(
  userId: string,
  publicationId: string,
  rules: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const updated = await db
    .update(promoMediumPublications)
    .set({ rules: rules.trim().slice(0, RULES_MAX), rulesReadAt: new Date() })
    .where(and(eq(promoMediumPublications.id, publicationId), eq(promoMediumPublications.userId, userId)))
    .returning({ id: promoMediumPublications.id })
  if (!updated.length) throw new Error("That publication is not on the list any more.")
}

/**
 * Asks each of the project's Medium accounts, in its own browser, what
 * Medium lets it do at the publication. The answers fill the writers list,
 * the name and the rules. An account that never signed in cannot be asked.
 */
export async function queuePublicationChecks(
  userId: string,
  publicationId: string,
  db: CustomShellDb = defaultDb
): Promise<number> {
  const [publication] = await db
    .select()
    .from(promoMediumPublications)
    .where(and(eq(promoMediumPublications.id, publicationId), eq(promoMediumPublications.userId, userId)))
    .limit(1)
  if (!publication) throw new Error("That publication is not on the list any more.")
  const accounts = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.projectId, publication.projectId),
        eq(promoAccounts.platform, "medium"),
        isNull(promoAccounts.retiredAt),
        isNotNull(promoAccounts.profileId),
        sql`${promoAccounts.handle} <> ''`
      )
    )
  if (!accounts.length) {
    throw new Refusal(
      "This project has no Medium account signed in on a browser profile, so nobody can ask Medium who writes there. An account on a phone publishes nothing, so it is not asked."
    )
  }
  // Asked again from scratch, so an account taken off as a writer drops off the list.
  await db.update(promoMediumPublications).set({ writers: [], writersReadAt: null }).where(eq(promoMediumPublications.id, publication.id))
  for (const account of accounts) {
    await queueJob(userId, "medium_publication", { publicationId: publication.id, accountId: account.id }, db)
  }
  return accounts.length
}

/** Writes one account's answer about a publication. */
export async function recordPublicationCheck(
  userId: string,
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const publicationId = typeof payload.publicationId === "string" ? payload.publicationId : ""
  const accountId = typeof payload.accountId === "string" ? payload.accountId : ""
  const [publication] = await db
    .select()
    .from(promoMediumPublications)
    .where(and(eq(promoMediumPublications.id, publicationId), eq(promoMediumPublications.userId, userId)))
    .limit(1)
  if (!publication) throw new Refusal("That publication is not on the list any more.")
  const read = await mediumPublication(target, { slug: publication.slug })
  if (!read.signedIn) throw new Refusal("The account's browser is not signed in to Medium, so Medium could not say what it may do there.")
  // Each account's answer comes from its own job, and two can finish at
  // once, so the list is changed in the database rather than read and
  // written back.
  const writers = read.writes
    ? sql`CASE WHEN ${promoMediumPublications.writers} ? ${accountId} THEN ${promoMediumPublications.writers} ELSE ${promoMediumPublications.writers} || jsonb_build_array(${accountId}::text) END`
    : sql`${promoMediumPublications.writers} - ${accountId}::text`
  await db
    .update(promoMediumPublications)
    .set({
      name: read.name.slice(0, 200) || publication.name,
      description: read.description,
      // Rules pasted by hand are never written over by a read.
      ...(read.rules && !publication.rules ? { rules: read.rules.slice(0, RULES_MAX), rulesReadAt: now } : {}),
      writers,
      writersReadAt: now,
    })
    .where(eq(promoMediumPublications.id, publication.id))
}
