import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"

import { promoPhoneActions } from "./schema"
import { refuseBrokenAction } from "./action-checks"

/**
 * How a job's Reddit step reaches a phone: the same named routine the browser
 * would get (`reddit/health`, `reddit/comment`), written as an action for the
 * phone's rack, then waited on. `src/server/browser/command.ts` calls this
 * for a phone target, so every Reddit flow, its shapes and its never-twice
 * rules stay exactly as they are for a browser.
 *
 * The rack runs only the names it knows. Until the Reddit app actions are
 * built (phone farm file 05) it answers every Reddit routine with "This rack
 * does not know the action ...", and the job fails with those words. A
 * routine the daily self-test found broken is refused before anything is
 * written, so a job never finds out the hard way.
 */

export type PhoneTarget = {
  phone: { id: string; userId: string; rackId: string; name: string }
}

/** How often the row is read while waiting. */
const POLL_MS = 500

/**
 * The time the rack has to pick the action up, on top of the action's own
 * time. The phone's lane runs one job at a time, so the only wait is the rack
 * asking for work every few seconds, or a check a person asked for.
 */
const PICK_UP_MS = 60_000

export class PhoneActionError extends Error {
  readonly routine: string
  constructor(routine: string, message: string) {
    super(message)
    this.name = "PhoneActionError"
    this.routine = routine
  }
}

export async function callPhone(
  target: PhoneTarget,
  routine: string,
  args: Record<string, unknown> | null,
  timeoutMs: number
): Promise<unknown> {
  await refuseBrokenAction(target.phone.userId, routine)
  const id = uuid()
  await db.insert(promoPhoneActions).values({
    id,
    userId: target.phone.userId,
    rackId: target.phone.rackId,
    phoneId: target.phone.id,
    action: routine,
    args: args ?? {},
    timeoutSeconds: Math.ceil(timeoutMs / 1000),
  })

  const giveUpAt = Date.now() + timeoutMs + PICK_UP_MS
  for (;;) {
    const [row] = await db
      .select({ status: promoPhoneActions.status, result: promoPhoneActions.result, error: promoPhoneActions.error })
      .from(promoPhoneActions)
      .where(eq(promoPhoneActions.id, id))
      .limit(1)
    if (!row) throw new PhoneActionError(routine, `${target.phone.name} was deleted while it was working.`)
    if (row.status === "done") return row.result ?? {}
    if (row.status === "failed" || row.status === "cancelled") {
      throw new PhoneActionError(routine, row.error || `${target.phone.name} did not finish ${routine}.`)
    }
    if (Date.now() > giveUpAt) {
      // Cancelled so a rack that picks it up late finds nothing to do, and
      // its answer is turned away (`finishAction` takes only running ones).
      await db
        .update(promoPhoneActions)
        .set({ status: "cancelled", error: "Promo stopped waiting for it.", finishedAt: new Date() })
        .where(eq(promoPhoneActions.id, id))
      throw new PhoneActionError(
        routine,
        `${target.phone.name} did not answer ${routine} within ${Math.round((timeoutMs + PICK_UP_MS) / 1000)} seconds.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
