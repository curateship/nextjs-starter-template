import { and, eq } from "drizzle-orm"

import { phoneStepRefusal, type PhoneKind } from "@/lib/phones/options"
import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { db } from "@/server/db"

import { promoPhoneActions } from "./schema"
import { refuseBrokenAction } from "./action-checks"
import { clearStepPictures } from "./trail"

/**
 * How a job's Reddit step reaches a phone: the same named routine the browser
 * would get (`reddit/health`, `reddit/comment`), written as an action for the
 * phone's rack, then waited on. `src/server/browser/command.ts` calls this
 * for a phone target, so every Reddit flow, its shapes and its never-twice
 * rules stay exactly as they are for a browser.
 *
 * The rack does Reddit in the Reddit app: who is signed in, the health
 * reading and the comment (phone farm file 05). Any other Reddit step, such
 * as answering a reply or a post of your own, is refused here before
 * anything is written, rather than reaching a rack that does not know it.
 * A routine the daily self-test found broken is refused the same way, so a
 * job never finds out the hard way.
 */

export type PhoneTarget = {
  phone: { id: string; userId: string; rackId: string; name: string; kind: PhoneKind }
}

/** How often the row is read while waiting. */
const POLL_MS = 500

/**
 * Slack on top of the action's own time: for the rack to pick it up once it
 * is its turn, and for its answer to arrive once it has started.
 */
const PICK_UP_MS = 60_000

/**
 * How long an action may wait its turn behind the phone's other actions,
 * such as a setup check a person asked for (up to four minutes). A comment
 * job is the address check before it and then the comment, each of which
 * could wait this long, and its claim on the job list lasts 25 minutes. Only
 * when the phone is busy both times does the claim run out first; the job is
 * then marked as stopped part-way, saying the comment may already be on
 * Reddit, and it is never tried again.
 */
const QUEUED_WAIT_MS = 5 * 60_000

/**
 * The routines that carry a private conversation: reading an inbox and
 * answering in it. Their words live in Promo only while the conversation is
 * open there (`src/server/social/phone-apps/inbox.ts`), so the action row
 * forgets its arguments and answer as soon as Promo has them, and a finished
 * one's step pictures, which show the conversation, go too. A failed one keeps
 * its pictures, so the step that went wrong can be seen, until a person
 * clears them (`clearStepPictures`).
 */
const PRIVATE_ROUTINE = /^(reddit|instagram|tiktok)\/(inbox|reply|reply_message)$/

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
  const cannot = phoneStepRefusal(routine, target.phone.name)
  if (cannot) throw new Refusal(cannot)
  // The self-test's verdict is per kind, so an iPhone's step is judged by the iPhone self-test.
  await refuseBrokenAction(target.phone.userId, routine, target.phone.kind)
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

  // Promo waits on the rack's own clock. While the action is still waiting
  // its turn (the phone may be busy with a check a person asked for), it can
  // be called off safely, since nothing has touched the phone. Once the rack
  // has started it, Promo waits the action's whole time from that moment, so
  // it never records a comment as failed while the rack is still typing it.
  const queuedUntil = Date.now() + QUEUED_WAIT_MS
  if (!PRIVATE_ROUTINE.test(routine)) return waitForAnswer(target, routine, id, timeoutMs, queuedUntil)
  let finished = false
  try {
    const answer = await waitForAnswer(target, routine, id, timeoutMs, queuedUntil)
    finished = true
    return answer
  } finally {
    await db.update(promoPhoneActions).set({ args: {}, result: null }).where(eq(promoPhoneActions.id, id))
    if (finished) await clearStepPictures(target.phone.userId, id)
  }
}

async function waitForAnswer(
  target: PhoneTarget,
  routine: string,
  id: string,
  timeoutMs: number,
  queuedUntil: number
): Promise<unknown> {
  for (;;) {
    const [row] = await db
      .select({
        status: promoPhoneActions.status,
        result: promoPhoneActions.result,
        error: promoPhoneActions.error,
        startedAt: promoPhoneActions.startedAt,
      })
      .from(promoPhoneActions)
      .where(eq(promoPhoneActions.id, id))
      .limit(1)
    if (!row) throw new PhoneActionError(routine, `${target.phone.name} was deleted while it was working.`)
    if (row.status === "done") return row.result ?? {}
    if (row.status === "failed" || row.status === "cancelled") {
      throw new PhoneActionError(routine, row.error || `${target.phone.name} did not finish ${routine}.`)
    }
    if (row.status === "queued" && Date.now() > queuedUntil) {
      // Cancelled only if it is still waiting, so a rack that took it this
      // very moment keeps it and is waited for.
      const [called] = await db
        .update(promoPhoneActions)
        .set({ status: "cancelled", error: "Promo stopped waiting before the rack started it.", finishedAt: new Date() })
        .where(and(eq(promoPhoneActions.id, id), eq(promoPhoneActions.status, "queued")))
        .returning({ id: promoPhoneActions.id })
      if (called) {
        throw new PhoneActionError(
          routine,
          `${target.phone.name} did not start ${routine} within ${Math.round(QUEUED_WAIT_MS / 60_000)} minutes, behind its other actions. Nothing was sent.`
        )
      }
      continue
    }
    if (row.status === "running" && row.startedAt && Date.now() > row.startedAt.getTime() + timeoutMs + PICK_UP_MS) {
      // The rack gives up a minute before its time and answers, so this is a
      // rack that went quiet. Marked failed so a late answer is turned away
      // (`finishAction` takes only running ones).
      await db
        .update(promoPhoneActions)
        .set({ status: "failed", error: "Promo stopped waiting for it.", finishedAt: new Date() })
        .where(and(eq(promoPhoneActions.id, id), eq(promoPhoneActions.status, "running")))
      throw new PhoneActionError(
        routine,
        `${target.phone.name} did not answer ${routine} within ${Math.round((timeoutMs + PICK_UP_MS) / 1000)} seconds of starting it.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
