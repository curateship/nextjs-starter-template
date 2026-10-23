import { and, eq, inArray, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getQuietAfterEmails } from "@/server/email/settings"
import { customShellContacts } from "@/server/schema"
import { now } from "@/server/auth/security"

/**
 * Marking the people who have stopped opening anything as "gone quiet".
 *
 * The rule in one sentence: the last N things sent to somebody all exist and
 * none of them was ever opened, where N is the workspace's
 * `quietAfterEmails`. Fewer than N sends is not enough evidence, so somebody
 * who has only ever had two unopened emails is left alone.
 *
 * **Why mark anybody at all.** Mailbox providers decide whether a sending
 * domain is wanted partly by how many of its messages get opened. Ten thousand
 * addresses that never open drag every message to everybody else towards the
 * spam folder. This is the app noticing before Gmail does.
 *
 * **Why it is reversible and not an unsubscribe.** An open puts the status
 * straight back to subscribed, which `clearQuietContact` does from the Resend
 * webhook. Quiet people are still in a send's audience, so there is always a
 * next message that could be opened — see `audienceConditions` in
 * `src/server/email/broadcast-send.ts`.
 *
 * **Why one unopened message would not do.** The open is a hidden image, so a
 * mail client that blocks pictures reports nothing on a message somebody read
 * end to end. That is why the rule needs a run of them and why the default is
 * seven rather than two.
 */
export async function markQuietContacts(
  workspaceId: string,
  /**
   * Who to reconsider: the people just sent something. Empty does nothing.
   *
   * Passing the ids rather than sweeping the workspace is deliberate. Going
   * quiet can only become true at the moment another message goes unopened, so
   * nobody else's answer can have changed. On a 25,000 contact list a sweep
   * would read every send ever recorded to work out what a batch of 200 already
   * knows.
   */
  contactIds: string[],
  database: CustomShellDb = db
): Promise<number> {
  if (contactIds.length === 0) return 0
  const quietAfter = await getQuietAfterEmails(workspaceId, database)

  /**
   * The ids as one parameter each, for `in (…)`.
   *
   * Not `= any(array)`. That binds the whole list as a single value, which the
   * real driver accepts and the in-memory Postgres the tests run on refuses
   * with "op ANY/ALL (array) requires array on right side" — so every send
   * would have worked by hand and thrown under test. A batch is a few hundred
   * ids at most, well inside what an `in` list carries.
   */
  const ids = sql.join(
    contactIds.map((id) => sql`${id}`),
    sql`, `
  )

  /**
   * Both tables, because a workspace's mail leaves through two: newsletters
   * through `deliveries` and automation steps through `automation_deliveries`.
   * Reading one of them would give a list that gets a weekly newsletter and a
   * welcome sequence two separate half-blind runs.
   *
   * `status = 'sent'` on both sides: a send that failed never left, so it
   * cannot have been opened and must not count towards the run.
   *
   * Written out rather than built with the query builder because of the window
   * function, and every table and column is named in full, so none of it
   * depends on what drizzle would have qualified.
   */
  const verdict = await database.execute(sql`
    with sent as (
      select contact_id, created_at, opened_at
      from deliveries
      where workspace_id = ${workspaceId}
        and contact_id in (${ids})
        and status = 'sent'
      union all
      select contact_id, created_at, opened_at
      from automation_deliveries
      where contact_id in (${ids})
        and status = 'sent'
    ),
    recent as (
      select contact_id, opened_at,
             row_number() over (
               partition by contact_id order by created_at desc
             ) as place
      from sent
    )
    select contact_id
    from recent
    where place <= ${quietAfter}
    group by contact_id
    having count(*) >= ${quietAfter}
       and count(opened_at) = 0
  `)

  const quiet = resultRows(verdict)
    .map((row) => String(row.contact_id))
    .filter(Boolean)
  if (quiet.length === 0) return 0

  // Only from subscribed. Somebody who opted out, bounced or complained has a
  // status that says more than "has not opened lately", and overwriting it
  // would lose the reason they are not being mailed.
  const updated = await database
    .update(customShellContacts)
    .set({ status: "cold", updatedAt: now() })
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        inArray(customShellContacts.id, quiet),
        eq(customShellContacts.status, "subscribed")
      )
    )
    .returning({ id: customShellContacts.id })

  return updated.length
}

/**
 * Puts somebody back on the list because they opened something.
 *
 * Only from cold. Opting out, bouncing and complaining all outrank an open:
 * somebody can open a message and still have asked to stop, and a mailbox that
 * bounced yesterday did not start working because an image loaded.
 */
export async function clearQuietContact(
  workspaceId: string,
  contactId: string,
  database: CustomShellDb = db
): Promise<number> {
  const updated = await database
    .update(customShellContacts)
    .set({ status: "subscribed", updatedAt: now() })
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        eq(customShellContacts.id, contactId),
        eq(customShellContacts.status, "cold")
      )
    )
    .returning({ id: customShellContacts.id })
  return updated.length
}

/**
 * The rows of a raw statement, whichever shape the caller's database hands
 * back.
 *
 * node-postgres answers `{ rows, rowCount }`; a test database standing in for
 * it can answer the array itself. Reading both beats assuming one and silently
 * finding nobody.
 */
function resultRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}
