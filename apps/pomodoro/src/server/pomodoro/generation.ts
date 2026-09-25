import { and, desc, eq, lt, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"

/** What `db.transaction` hands its callback — a database minus the pool. */
type PomodoroTransaction = Parameters<
  Parameters<CustomShellDb["transaction"]>[0]
>[0]
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  pomodoroGenerations,
  pomodoroGenerationUsage,
  type PomodoroGeneration,
} from "@/server/pomodoro/schema"
import { customShellMedia } from "@/server/schema"
import { getPublicMediaUrl } from "@/server/media/storage"
import type { GenerationKind } from "@/lib/pomodoro/generation"

/**
 * The credit ledger and the queue behind AI backgrounds and soundscapes.
 *
 * The ledger is the old app's (`apps/pomoder/src/server/generation.ts`): a
 * credit is taken when the request is accepted and handed back when the job
 * finally fails, so a member never pays for something they did not get. Taking
 * it up front is what stops twenty videos being queued while the first renders.
 */

/**
 * A worker pass that dies leaves a claim behind; this is when to retry it.
 *
 * Comfortably longer than the longest a live job can legitimately take: Veo may
 * poll for six minutes and FFmpeg for four, and then the file still has to go
 * up to the bucket. At ten minutes a slow-but-alive job had its claim stolen
 * while it was still working, and both passes then finished it — two files, and
 * the credit counted twice. The settle guards below make that harmless anyway;
 * this is what stops it being attempted.
 */
const CLAIM_TIMEOUT_MS = 25 * 60 * 1000

/** How many times a generation is tried before the credit is handed back. */
const MAX_ATTEMPTS = 2

/** How many past requests the panel shows. */
const HISTORY_LIMIT = 12

/** The month a credit belongs to, as the first of it, in UTC. */
export function generationMonth(timestamp = new Date()) {
  const year = timestamp.getUTCFullYear()
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

/** How many of this kind the plan allows each month. */
export function monthlyLimitFor(
  entitlements: { monthlyBackgrounds: number; monthlySoundscapes: number },
  kind: GenerationKind
) {
  return kind === "background"
    ? entitlements.monthlyBackgrounds
    : entitlements.monthlySoundscapes
}

/**
 * Take one credit, or refuse.
 *
 * The row is locked for the length of the transaction, so two requests sent at
 * the same moment cannot both read "one left" and both take it.
 */
export async function reserveGenerationCredit(
  userId: string,
  kind: GenerationKind,
  limit: number,
  month = generationMonth()
) {
  if (limit <= 0) throw new Error("GENERATION_NOT_ALLOWED")

  return db.transaction(async (tx) => {
    await tx
      .insert(pomodoroGenerationUsage)
      .values({ userId, month, kind })
      .onConflictDoNothing()

    const [usage] = await tx
      .select()
      .from(pomodoroGenerationUsage)
      .where(
        and(
          eq(pomodoroGenerationUsage.userId, userId),
          eq(pomodoroGenerationUsage.month, month),
          eq(pomodoroGenerationUsage.kind, kind)
        )
      )
      .for("update")

    if (!usage) throw new Error("GENERATION_LIMIT_REACHED")
    const spent = usage.reserved - usage.refunded
    if (spent >= limit) throw new Error("GENERATION_LIMIT_REACHED")

    await tx
      .update(pomodoroGenerationUsage)
      .set({ reserved: usage.reserved + 1, updatedAt: new Date() })
      .where(eq(pomodoroGenerationUsage.id, usage.id))

    return { month, left: limit - (spent + 1) }
  })
}

/**
 * Close the books on one credit: counted as used, or handed back.
 *
 * A refund raises `refunded` rather than lowering `reserved`, so the ledger
 * still shows that the attempt happened. Both counters only ever go up, which
 * is what makes a replayed settle harmless to read.
 */
export async function settleGenerationCredit(
  userId: string,
  kind: GenerationKind,
  month: string,
  success: boolean,
  database: CustomShellDb | PomodoroTransaction = db
) {
  await database
    .update(pomodoroGenerationUsage)
    .set(
      success
        ? {
            completed: sql`${pomodoroGenerationUsage.completed} + 1`,
            updatedAt: new Date(),
          }
        : {
            refunded: sql`${pomodoroGenerationUsage.refunded} + 1`,
            updatedAt: new Date(),
          }
    )
    .where(
      and(
        eq(pomodoroGenerationUsage.userId, userId),
        eq(pomodoroGenerationUsage.month, month),
        eq(pomodoroGenerationUsage.kind, kind)
      )
    )
}

/** What is left of this month's allowance, for the panel's counter. */
export async function creditsLeft(
  userId: string,
  kind: GenerationKind,
  limit: number,
  month = generationMonth()
) {
  const [usage] = await db
    .select()
    .from(pomodoroGenerationUsage)
    .where(
      and(
        eq(pomodoroGenerationUsage.userId, userId),
        eq(pomodoroGenerationUsage.month, month),
        eq(pomodoroGenerationUsage.kind, kind)
      )
    )
    .limit(1)

  const spent = usage ? usage.reserved - usage.refunded : 0
  return Math.max(0, limit - spent)
}

/** Put the request in the queue. The credit has already been taken. */
export async function queueGeneration({
  userId,
  kind,
  prompt,
  month,
}: {
  userId: string
  kind: GenerationKind
  prompt: string
  month: string
}) {
  const [row] = await db
    .insert(pomodoroGenerations)
    .values({ userId, kind, prompt, month })
    .returning()
  return row
}

export type GenerationRow = {
  id: string
  kind: GenerationKind
  prompt: string
  status: string
  failureReason: string | null
  mediaId: string | null
  url: string
  createdAt: Date
}

/** This person's recent requests of one kind, oldest first, newest last. */
export async function listGenerations(
  userId: string,
  kind: GenerationKind
): Promise<GenerationRow[]> {
  const rows = await db
    .select({
      id: pomodoroGenerations.id,
      kind: pomodoroGenerations.kind,
      prompt: pomodoroGenerations.prompt,
      status: pomodoroGenerations.status,
      failureReason: pomodoroGenerations.failureReason,
      mediaId: pomodoroGenerations.mediaId,
      createdAt: pomodoroGenerations.createdAt,
      storagePath: customShellMedia.storagePath,
    })
    .from(pomodoroGenerations)
    .leftJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroGenerations.mediaId)
    )
    .where(
      and(
        eq(pomodoroGenerations.userId, userId),
        eq(pomodoroGenerations.kind, kind)
      )
    )
    .orderBy(desc(pomodoroGenerations.createdAt))
    .limit(HISTORY_LIMIT)

  const resolved = await Promise.all(
    rows.map(async ({ storagePath, ...row }) => ({
      ...row,
      kind: row.kind as GenerationKind,
      url:
        row.status === "ready" && storagePath
          ? await getPublicMediaUrl(storagePath)
          : "",
    }))
  )
  // Read newest-first from the database so the limit keeps the recent ones,
  // then turned round so the panel reads in the order they were asked for.
  return resolved.reverse()
}

/**
 * Take the oldest request nobody is working on, in one statement.
 *
 * The claim is the update itself, so two overlapping worker passes cannot both
 * get the same row. A claim older than the timeout is fair game again, which
 * un-sticks a job whose process died holding it. The timeout is generous
 * because a Veo render can legitimately take minutes.
 */
export async function claimNextGeneration(
  database: CustomShellDb = db
): Promise<PomodoroGeneration | null> {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS)
  const [claimed] = await database
    .update(pomodoroGenerations)
    .set({
      status: "running",
      claimedAt: new Date(),
      attempts: sql`${pomodoroGenerations.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      eq(
        pomodoroGenerations.id,
        sql`(
          select ${pomodoroGenerations.id} from ${pomodoroGenerations}
          where ${or(
            eq(pomodoroGenerations.status, "queued"),
            and(
              eq(pomodoroGenerations.status, "running"),
              lt(pomodoroGenerations.claimedAt, staleBefore)
            )
          )}
          order by ${pomodoroGenerations.createdAt}
          limit 1
          for update skip locked
        )`
      )
    )
    .returning()

  return claimed ?? null
}

/**
 * The file arrived: point the request at it and count the credit as used.
 *
 * Only a job still marked running is settled. If two passes somehow both
 * finished the same request — a stolen claim, a retry that overlapped — the
 * second update matches nothing and the credit is counted once, which is the
 * only number that must never be wrong. Returns whether this pass was the one
 * that closed it.
 */
export async function finishGeneration(
  job: PomodoroGeneration,
  mediaId: string
) {
  return db.transaction(async (tx) => {
    const closed = await tx
      .update(pomodoroGenerations)
      .set({
        status: "ready",
        mediaId,
        failureReason: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pomodoroGenerations.id, job.id),
          eq(pomodoroGenerations.status, "running")
        )
      )
      .returning({ id: pomodoroGenerations.id })

    if (!closed.length) return { settled: false }

    await settleGenerationCredit(
      job.userId,
      job.kind as GenerationKind,
      job.month,
      true,
      tx
    )
    return { settled: true }
  })
}

/**
 * The attempt did not work.
 *
 * The first attempt goes back in the queue, because the usual cause is a
 * provider having a bad minute. Once the attempts run out the request is marked
 * failed **and the credit is handed back in the same transaction**, so the
 * ledger can never show a member charged for a file they never got.
 */
export async function failGeneration(
  job: PomodoroGeneration,
  reason: string,
  { retry = true }: { retry?: boolean } = {}
) {
  const giveUp = !retry || job.attempts >= MAX_ATTEMPTS

  return db.transaction(async (tx) => {
    // Same guard as finishing: only a job still running is settled, so a
    // stolen claim cannot refund one credit twice.
    const closed = await tx
      .update(pomodoroGenerations)
      .set({
        status: giveUp ? "failed" : "queued",
        failureReason: reason.slice(0, 200),
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pomodoroGenerations.id, job.id),
          eq(pomodoroGenerations.status, "running")
        )
      )
      .returning({ id: pomodoroGenerations.id })

    if (!closed.length) return { refunded: false }

    if (giveUp) {
      await settleGenerationCredit(
        job.userId,
        job.kind as GenerationKind,
        job.month,
        false,
        tx
      )
    }
    return { refunded: giveUp }
  })
}

/** The allowance and what is left of it, for one person and one kind. */
export async function loadGenerationAllowance(
  userId: string,
  kind: GenerationKind
) {
  const entitlements = await loadPomodoroEntitlements(userId)
  const limit = monthlyLimitFor(entitlements, kind)
  return { limit, left: await creditsLeft(userId, kind, limit) }
}
