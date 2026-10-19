import { and, eq, inArray, lt } from "drizzle-orm"

import {
  ACTION_ANSWER_GRACE_MS,
  ACTION_WAIT_LIMIT_MS,
  PHONE_ACTION_KINDS,
  type PhoneActionKind,
} from "@/lib/dating/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { datePhoneActions, datePhones } from "./schema"

/**
 * Writing plain actions for a phone and waiting for their answers.
 *
 * `queueAction` writes one and returns at once: the Phone screen's picture
 * button and a tap in the screen window use it. `callPhone` writes one and
 * waits for the phone's answer: every step of a Tinder walk uses it. Both go
 * through the same queue, so the phone does one thing at a time, in order.
 *
 * Copied from Promo's `queue.ts` and `dispatch.ts`, without the rack, the
 * hold and the self-test, which Date has none of.
 */

/** Refuses to write an action for a phone that cannot take it, in words a person can act on. */
async function checkPhoneTakesActions(userId: string, phoneId: string, db: CustomShellDb) {
  const [phone] = await db
    .select({
      id: datePhones.id,
      keyEncrypted: datePhones.keyEncrypted,
      inControl: datePhones.inControl,
      name: datePhones.name,
    })
    .from(datePhones)
    .where(and(eq(datePhones.id, phoneId), eq(datePhones.userId, userId)))
    .limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  if (!phone.keyEncrypted) throw new Error(`${phone.name} is not paired. Pair it on the Phone screen first.`)
  if (!phone.inControl) throw new Error(`Date is switched off for ${phone.name}. Switch it on on the Phone screen first.`)
  return phone
}

/**
 * Writes one action on its own, outside any walk. Refused while a walk is
 * working the phone, because a tap from the screen window in the middle of
 * one would leave the walk reading a screen it did not expect.
 */
export async function queueAction(
  userId: string,
  phoneId: string,
  kind: PhoneActionKind,
  payload: Record<string, unknown>,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  timeLimitSeconds = 30
): Promise<string> {
  if (!(PHONE_ACTION_KINDS as readonly string[]).includes(kind)) throw new Error("That is not something the phone does.")
  await checkPhoneTakesActions(userId, phoneId, db)
  const [busy] = await db
    .select({ id: datePhoneActions.id })
    .from(datePhoneActions)
    .where(
      and(
        eq(datePhoneActions.phoneId, phoneId),
        inArray(datePhoneActions.status, ["waiting", "running"])
      )
    )
    .limit(1)
  if (busy && kind === "tap") {
    throw new Error("The phone is busy with another step. Wait for it to finish, or press Stop on the dashboard.")
  }
  const id = uuid()
  await db.insert(datePhoneActions).values({ id, userId, phoneId, kind, payload, timeLimitSeconds, createdAt: now })
  return id
}

/** A step that did not come back done, with the reason in words. */
export class PhoneActionError extends Error {
  readonly kind: PhoneActionKind
  /** True when the phone never started the step, so nothing on it changed. */
  readonly untouched: boolean
  constructor(kind: PhoneActionKind, message: string, untouched: boolean) {
    super(message)
    this.name = "PhoneActionError"
    this.kind = kind
    this.untouched = untouched
  }
}

/** How long a walk's step may wait for the phone to pick it up. A phone asleep in a pocket is away, not broken. */
export const PICKUP_WAIT_MS = 2 * 60_000

export type PhoneAnswer = { answer: Record<string, unknown>; screenshot: string | null }

export type CallOptions = {
  pollMs?: number
  pickupWaitMs?: number
}

/**
 * Writes one step of a walk and waits for the phone's answer. While the step
 * is still waiting its turn it can be called off safely, since nothing has
 * touched the phone. Once the phone has started it, the server waits the
 * step's whole time and a minute more, so a step is never recorded as failed
 * while the phone is still doing it.
 */
export async function callPhone(
  phone: { id: string; userId: string; name: string },
  walkId: string,
  kind: PhoneActionKind,
  payload: Record<string, unknown>,
  timeLimitSeconds: number,
  db: CustomShellDb = defaultDb,
  options: CallOptions = {}
): Promise<PhoneAnswer> {
  await checkPhoneTakesActions(phone.userId, phone.id, db)
  const id = uuid()
  await db.insert(datePhoneActions).values({
    id,
    userId: phone.userId,
    phoneId: phone.id,
    walkId,
    kind,
    payload,
    timeLimitSeconds,
    createdAt: new Date(),
  })

  const pollMs = options.pollMs ?? 400
  const pickupUntil = Date.now() + (options.pickupWaitMs ?? PICKUP_WAIT_MS)
  for (;;) {
    const [row] = await db
      .select({
        status: datePhoneActions.status,
        answer: datePhoneActions.answer,
        error: datePhoneActions.error,
        screenshot: datePhoneActions.screenshot,
        startedAt: datePhoneActions.startedAt,
      })
      .from(datePhoneActions)
      .where(eq(datePhoneActions.id, id))
      .limit(1)
    if (!row) throw new PhoneActionError(kind, `${phone.name} was removed while it was working.`, false)
    if (row.status === "done") return { answer: row.answer ?? {}, screenshot: row.screenshot }
    if (row.status === "failed") throw new PhoneActionError(kind, row.error || `${phone.name} did not finish the step.`, false)
    if (row.status === "cancelled") throw new PhoneActionError(kind, row.error || "The step was cancelled.", true)
    if (row.status === "waiting" && Date.now() > pickupUntil) {
      // Called off only if it is still waiting, so a phone that took it this
      // very moment keeps it and is waited for.
      const [called] = await db
        .update(datePhoneActions)
        .set({
          status: "cancelled",
          error: "The phone did not pick this step up within two minutes. It may be away, asleep or out of signal.",
          finishedAt: new Date(),
        })
        .where(and(eq(datePhoneActions.id, id), eq(datePhoneActions.status, "waiting")))
        .returning({ id: datePhoneActions.id })
      if (called) {
        throw new PhoneActionError(
          kind,
          `${phone.name} did not pick up the next step within two minutes. It may be away, asleep or out of signal. Nothing more was done on it.`,
          true
        )
      }
      continue
    }
    if (
      row.status === "running" &&
      row.startedAt &&
      Date.now() > row.startedAt.getTime() + timeLimitSeconds * 1000 + ACTION_ANSWER_GRACE_MS
    ) {
      await db
        .update(datePhoneActions)
        .set({ status: "failed", error: "The server stopped waiting for the phone's answer.", finishedAt: new Date() })
        .where(and(eq(datePhoneActions.id, id), eq(datePhoneActions.status, "running")))
      throw new PhoneActionError(
        kind,
        `${phone.name} did not answer within ${timeLimitSeconds + ACTION_ANSWER_GRACE_MS / 1000} seconds of starting the step.`,
        false
      )
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

/**
 * Actions that waited an hour for a phone that never came are cancelled with
 * the reason "phone away". Tyler, 17 Oct 2026: a phone in a pocket sleeps and
 * loses signal, which is normal.
 */
export async function cancelAbandonedActions(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  await db
    .update(datePhoneActions)
    .set({ status: "cancelled", error: "Phone away: it did not pick this up within an hour.", finishedAt: now })
    .where(
      and(
        eq(datePhoneActions.status, "waiting"),
        lt(datePhoneActions.createdAt, new Date(now.getTime() - ACTION_WAIT_LIMIT_MS))
      )
    )
}

/** Forgets the screenshots of a walk's steps once the walk has used them. */
export async function forgetWalkScreenshots(walkId: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db.update(datePhoneActions).set({ screenshot: null }).where(eq(datePhoneActions.walkId, walkId))
}

/** Lists kept pictures on a walk's step, so the Phone screen's history shows them. */
export async function addStepPictures(actionId: string, pictureIds: string[], db: CustomShellDb = defaultDb): Promise<void> {
  if (!pictureIds.length) return
  const [row] = await db
    .select({ pictureIds: datePhoneActions.pictureIds })
    .from(datePhoneActions)
    .where(eq(datePhoneActions.id, actionId))
    .limit(1)
  if (!row) return
  await db
    .update(datePhoneActions)
    .set({ pictureIds: Array.from(new Set([...row.pictureIds, ...pictureIds])) })
    .where(eq(datePhoneActions.id, actionId))
}
