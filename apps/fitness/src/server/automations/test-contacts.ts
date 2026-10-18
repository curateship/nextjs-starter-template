import { and, asc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { customShellContacts, customShellUsers } from "@/server/schema"

export type AutomationTestContact = {
  id: string
  userId: string | null
  name: string
  email: string
}

/**
 * The contacts a real send could reach: subscribed or cold, and either with no
 * account behind them or with an active member's account. An admin or an app
 * role's account is never the person a member flow is tested on.
 */
function testableContactCondition(workspaceId: string): SQL {
  return and(
    eq(customShellContacts.workspaceId, workspaceId),
    inArray(customShellContacts.status, ["subscribed", "cold"]),
    or(
      isNull(customShellContacts.userId),
      and(
        eq(customShellUsers.role, "member"),
        eq(customShellUsers.status, "active")
      )
    )
  ) as SQL
}

function contactName(contact: {
  firstName: string | null
  lastName: string | null
}) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()
}

async function selectTestableContacts(
  workspaceId: string,
  match: SQL | undefined,
  limit: number,
  database: CustomShellDb
): Promise<AutomationTestContact[]> {
  const rows = await database
    .select({
      id: customShellContacts.id,
      userId: customShellContacts.userId,
      email: customShellContacts.email,
      firstName: customShellContacts.firstName,
      lastName: customShellContacts.lastName,
    })
    .from(customShellContacts)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellContacts.userId)
    )
    .where(and(testableContactCondition(workspaceId), match))
    .orderBy(
      asc(customShellContacts.firstName),
      asc(customShellContacts.lastName),
      asc(customShellContacts.email)
    )
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: contactName(row),
    email: row.email,
  }))
}

/** Contacts the one-contact test picker offers, searched by name or email. */
export async function listAutomationTestContacts(
  workspaceId: string,
  search: string,
  database: CustomShellDb = db
): Promise<AutomationTestContact[]> {
  const term = search.trim()
  const match = term
    ? or(
        ilike(customShellContacts.firstName, `%${term}%`),
        ilike(customShellContacts.lastName, `%${term}%`),
        ilike(customShellContacts.email, `%${term}%`)
      )
    : undefined

  return selectTestableContacts(workspaceId, match, 25, database)
}

/** One testable contact, but only when it belongs to this workspace. */
export async function findAutomationTestContact(
  workspaceId: string,
  contactId: string,
  database: CustomShellDb = db
): Promise<AutomationTestContact | null> {
  const [contact] = await selectTestableContacts(
    workspaceId,
    eq(customShellContacts.id, contactId),
    1,
    database
  )
  return contact ?? null
}
