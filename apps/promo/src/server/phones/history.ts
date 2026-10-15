import { and, desc, eq } from "drizzle-orm"

import type { PhoneEventKind } from "@/lib/phones/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoPhoneEvents } from "./schema"

/**
 * A phone's history, for the History tab in its window: plugged in,
 * unplugged, restarted, an app updated, an account moved onto it or signed
 * in, ran hot, and each notice raised and cleared. Built like a browser
 * profile's history (`src/server/browser/events.ts`).
 *
 * Never fails the thing it records. A line that cannot be written is logged,
 * and the check-in or the sweep that wrote it carries on.
 */
export async function recordPhoneEvent(
  userId: string,
  phoneId: string,
  kind: PhoneEventKind,
  detail: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  try {
    await db.insert(promoPhoneEvents).values({
      id: uuid(),
      userId,
      phoneId,
      kind,
      detail: detail.slice(0, 2_000),
      createdAt: now,
    })
  } catch (error) {
    console.error(`Could not write a ${kind} line in phone ${phoneId}'s history`, error)
  }
}

export type PhoneEventView = { id: string; kind: PhoneEventKind; detail: string; at: Date }

/** The newest 200 lines, newest first. */
export async function phoneHistory(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb
): Promise<PhoneEventView[]> {
  const rows = await db
    .select()
    .from(promoPhoneEvents)
    .where(and(eq(promoPhoneEvents.phoneId, phoneId), eq(promoPhoneEvents.userId, userId)))
    .orderBy(desc(promoPhoneEvents.createdAt), desc(promoPhoneEvents.id))
    .limit(200)
  return rows.map((row) => ({ id: row.id, kind: row.kind, detail: row.detail, at: row.createdAt }))
}
