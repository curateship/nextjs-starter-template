import { and, desc, eq, ilike, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { newsletterContacts, type NewsletterContact } from "@/server/schema"
import { now, uuid } from "@/server/security"

export type UpsertContactInput = {
  email: string
  firstName?: string
  lastName?: string
  source?: string
  tags?: string[]
  customFields?: Record<string, unknown>
}

/**
 * Inserts or merges a contact. Merge semantics: tags union, custom fields
 * shallow-merge, names overwrite only when provided, source is first-touch.
 */
export async function upsertContact(
  workspaceId: string,
  input: UpsertContactInput,
  database: CustomShellDb = db
): Promise<NewsletterContact> {
  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error("Email is required")

  const tags = normalizeTags(input.tags)
  const customFields = input.customFields ?? {}
  const timestamp = now()

  const [inserted] = await database
    .insert(newsletterContacts)
    .values({
      id: uuid(),
      workspaceId,
      email,
      firstName: input.firstName?.trim() || null,
      lastName: input.lastName?.trim() || null,
      source: input.source?.trim() || null,
      tags,
      customFields,
      status: "subscribed",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()
    .returning()

  if (inserted) return inserted

  const existing = await findContactByEmail(workspaceId, email, database)
  if (!existing) throw new Error("Contact upsert failed")

  const existingFields =
    existing.customFields && typeof existing.customFields === "object"
      ? (existing.customFields as Record<string, unknown>)
      : {}

  const [updated] = await database
    .update(newsletterContacts)
    .set({
      firstName: input.firstName?.trim() || existing.firstName,
      lastName: input.lastName?.trim() || existing.lastName,
      source: existing.source ?? (input.source?.trim() || null),
      tags: [...new Set([...existing.tags, ...tags])],
      customFields: { ...existingFields, ...customFields },
      updatedAt: now(),
    })
    .where(eq(newsletterContacts.id, existing.id))
    .returning()

  if (!updated) throw new Error("Contact upsert failed")
  return updated
}

export async function findContactByEmail(
  workspaceId: string,
  email: string,
  database: CustomShellDb = db
) {
  const normalized = email.trim().toLowerCase()
  const [row] = await database
    .select()
    .from(newsletterContacts)
    .where(
      and(
        eq(newsletterContacts.workspaceId, workspaceId),
        sql`lower(${newsletterContacts.email}) = ${normalized}`
      )
    )
    .limit(1)

  return row ?? null
}

export async function listContacts(
  workspaceId: string,
  options: { search?: string; limit?: number; offset?: number } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  const filters = [eq(newsletterContacts.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(newsletterContacts.email, pattern),
      ilike(newsletterContacts.firstName, pattern),
      ilike(newsletterContacts.lastName, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }

  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(newsletterContacts)
      .where(where)
      .orderBy(desc(newsletterContacts.createdAt))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(newsletterContacts)
      .where(where),
  ])

  return { contacts: rows, total: countRow?.total ?? 0 }
}

function normalizeTags(tags: string[] | undefined) {
  if (!tags) return []
  return [
    ...new Set(
      tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)
    ),
  ].slice(0, 50)
}
