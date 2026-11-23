import { and, asc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { userBelongsToWorkspaceCondition } from "@/server/people/workspace-users"
import { customShellContacts, customShellUsers } from "@/server/schema"

/**
 * One person a flow can be tested on: a subscriber or an account. The two are
 * separate lists (Tyler, 9 Nov 2026: "users and subscribers are also
 * seperate"), so a subscriber flow is tested on a subscriber and an account
 * flow on an account. `id` is the picker's own key, "c:<contact>" or
 * "a:<account>", so one value can be sent back to start the test.
 */
export type AutomationTestContact = {
  id: string
  kind: "subscriber" | "account"
  contactId: string | null
  userId: string | null
  name: string
  email: string
}

/** Reads a picker key back, or null for one that is neither kind. */
export function readTestPersonKey(key: string): { contactId: string } | { userId: string } | null {
  const [kind, id] = [key.slice(0, 2), key.slice(2)]
  if (!id || id.length > 36) return null
  if (kind === "c:") return { contactId: id }
  if (kind === "a:") return { userId: id }
  return null
}

function contactName(contact: { firstName: string | null; lastName: string | null }) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()
}

/**
 * Subscribers a real send could reach (subscribed or cold), and active member
 * accounts of this site that have not turned automated mail off. An admin or
 * an app role's account is never the person a member flow is tested on.
 */
async function selectTestablePeople(
  workspaceId: string,
  match: { contacts?: SQL; accounts?: SQL; only?: "subscriber" | "account" },
  limit: number,
  database: CustomShellDb
): Promise<AutomationTestContact[]> {
  const [subscribers, accounts] = await Promise.all([
    match.only === "account"
      ? []
      : database
          .select({
            id: customShellContacts.id,
            email: customShellContacts.email,
            firstName: customShellContacts.firstName,
            lastName: customShellContacts.lastName,
          })
          .from(customShellContacts)
          .where(
            and(
              eq(customShellContacts.workspaceId, workspaceId),
              inArray(customShellContacts.status, ["subscribed", "cold"]),
              match.contacts
            )
          )
          .orderBy(asc(customShellContacts.firstName), asc(customShellContacts.lastName), asc(customShellContacts.email))
          .limit(limit),
    match.only === "subscriber"
      ? []
      : database
          .select({ id: customShellUsers.id, email: customShellUsers.email, name: customShellUsers.name })
          .from(customShellUsers)
          .where(
            and(
              await userBelongsToWorkspaceCondition(workspaceId, database),
              eq(customShellUsers.role, "member"),
              eq(customShellUsers.status, "active"),
              isNull(customShellUsers.automatedMailOffAt),
              match.accounts
            )
          )
          .orderBy(asc(customShellUsers.name), asc(customShellUsers.email))
          .limit(limit),
  ])

  return [
    ...subscribers.map((row) => ({
      id: `c:${row.id}`,
      kind: "subscriber" as const,
      contactId: row.id,
      userId: null,
      name: contactName(row),
      email: row.email,
    })),
    ...accounts.map((row) => ({
      id: `a:${row.id}`,
      kind: "account" as const,
      contactId: null,
      userId: row.id,
      name: row.name.trim(),
      email: row.email,
    })),
  ].slice(0, limit)
}

/** The people the one-person test picker offers, searched by name or email. */
export async function listAutomationTestContacts(
  workspaceId: string,
  search: string,
  database: CustomShellDb = db
): Promise<AutomationTestContact[]> {
  const term = search.trim()
  return selectTestablePeople(
    workspaceId,
    term
      ? {
          contacts: or(
            ilike(customShellContacts.firstName, `%${term}%`),
            ilike(customShellContacts.lastName, `%${term}%`),
            ilike(customShellContacts.email, `%${term}%`)
          ),
          accounts: or(ilike(customShellUsers.name, `%${term}%`), ilike(customShellUsers.email, `%${term}%`)),
        }
      : {},
    25,
    database
  )
}

/** One testable person by picker key, but only when they belong to this site. */
export async function findAutomationTestContact(
  workspaceId: string,
  key: string,
  database: CustomShellDb = db
): Promise<AutomationTestContact | null> {
  const person = readTestPersonKey(key)
  if (!person) return null
  const [found] = await selectTestablePeople(
    workspaceId,
    "contactId" in person
      ? { only: "subscriber", contacts: eq(customShellContacts.id, person.contactId) }
      : { only: "account", accounts: eq(customShellUsers.id, person.userId) },
    1,
    database
  )
  return found ?? null
}
