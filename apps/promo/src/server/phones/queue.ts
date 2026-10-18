import { and, eq, inArray, sql } from "drizzle-orm"

import { PHONE_ACTIONS, PHONE_STALE_MS, type PhoneAction } from "@/lib/phones/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoPhoneActions, promoPhones, promoRacks } from "./schema"

/**
 * Writes a named action for one phone, because a person pressed a button or
 * Promo's own daily self-test asked. Refused for a name not on the list, a
 * held phone, and a phone with no connected rack. A second ask while the
 * same action with the same arguments is waiting adds nothing.
 */
export async function queuePhoneAction(
  userId: string,
  phoneId: string,
  action: PhoneAction,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  options: { args?: Record<string, unknown>; timeoutSeconds?: number } = {}
): Promise<string> {
  const args = options.args ?? {}
  if (!(PHONE_ACTIONS as readonly string[]).includes(action)) throw new Error("That is not an action a phone runs.")
  const [row] = await db
    .select({ phone: promoPhones, rackDisconnectedAt: promoRacks.disconnectedAt, rackSeenAt: promoRacks.seenAt })
    .from(promoPhones)
    .leftJoin(promoRacks, eq(promoRacks.id, promoPhones.rackId))
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That phone does not exist.")
  const { phone } = row
  if (phone.held) throw new Error("That phone is held. Release it first.")
  if (!phone.rackId || row.rackDisconnectedAt) throw new Error("That phone is not on a connected rack.")
  if (!row.rackSeenAt || now.getTime() - row.rackSeenAt.getTime() > PHONE_STALE_MS) {
    throw new Error("The rack has not checked in for a minute. Check the computer the phones are plugged into.")
  }
  if (phone.adbState !== "device" || !phone.lastSeenAt || now.getTime() - phone.lastSeenAt.getTime() > PHONE_STALE_MS) {
    throw new Error("That phone is offline. Plug it in and answer the question on its screen: Allow USB debugging on an Android, Trust this computer on an iPhone.")
  }

  const [waiting] = await db
    .select({ id: promoPhoneActions.id })
    .from(promoPhoneActions)
    .where(
      and(
        eq(promoPhoneActions.phoneId, phoneId),
        eq(promoPhoneActions.action, action),
        sql`${promoPhoneActions.args} = ${JSON.stringify(args)}::jsonb`,
        inArray(promoPhoneActions.status, ["queued", "running"])
      )
    )
    .limit(1)
  if (waiting) return waiting.id

  const id = uuid()
  await db.insert(promoPhoneActions).values({
    id,
    userId,
    rackId: phone.rackId,
    phoneId,
    action,
    args,
    ...(options.timeoutSeconds ? { timeoutSeconds: options.timeoutSeconds } : {}),
    createdAt: now,
  })
  return id
}
