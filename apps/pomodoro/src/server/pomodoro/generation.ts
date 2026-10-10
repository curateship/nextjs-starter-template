import { randomUUID } from "node:crypto"

import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"

/** What `db.transaction` hands its callback — a database minus the pool. */
type PomodoroTransaction = Parameters<
  Parameters<CustomShellDb["transaction"]>[0]
>[0]
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  pomodoroGenerations,
  pomodoroGenerationUsage,
  pomodoroMediaUploads,
  pomodoroPackUsage,
  pomodoroPurchases,
  type PomodoroGeneration,
} from "@/server/pomodoro/schema"
import { billingEnabled } from "@/server/billing/stripe"
import { PACK_FOR_KIND, PURCHASES } from "@/lib/pomodoro/purchases"
import { inCurrentStripeMode } from "@/server/pomodoro/bought-space"
import { customShellMedia } from "@/server/schema"
import { getPublicMediaUrl } from "@/server/media/storage"
import { writeNotices } from "@/server/pomodoro/notices"
import {
  describeQueuePlace,
  GENERATION_PURPOSE,
  generationStyle,
  TYPICAL_SECONDS,
  type GenerationKind,
  type GenerationStyleKey,
} from "@/lib/pomodoro/generation"
import {
  creditsLowMessage,
  MEDIA_PAGE,
  mediaFailedMessage,
  mediaReadyMessage,
} from "@/lib/pomodoro/notices"

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
  return db.transaction((tx) => takeCredit(tx, userId, kind, limit, month))
}

/**
 * One credit, inside the caller's transaction, so a whole look (task 06,
 * part 7) takes both of its credits or neither.
 */
async function takeCredit(
  tx: PomodoroTransaction,
  userId: string,
  kind: GenerationKind,
  limit: number,
  month: string
) {
  if (limit <= 0) throw new Error("GENERATION_NOT_ALLOWED")
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
  // The month's are gone: a bought pack's, if any are left (task 07). They
  // are spent only after the free ones, and only while the plan allows AI at
  // all, which the limit check above already holds to.
  if (spent >= limit) {
    await takePackCredit(tx, userId, kind)
    return { month, left: 0, pot: "pack" as const }
  }

  const left = limit - (spent + 1)
  // One left, or none: say so once each per month and kind, before the next
  // request is refused rather than after. The stamp is what stops a refund
  // that lifts the count back up from sending the same warning twice.
  const warn =
    left === 1 && !usage.warnedLowAt
      ? ({ warnedLowAt: new Date() } as const)
      : left === 0 && !usage.warnedEmptyAt
        ? ({ warnedEmptyAt: new Date() } as const)
        : null

  await tx
    .update(pomodoroGenerationUsage)
    .set({ reserved: usage.reserved + 1, updatedAt: new Date(), ...warn })
    .where(eq(pomodoroGenerationUsage.id, usage.id))

  if (warn) {
    await writeNotices(tx, [
      {
        recipientUserId: userId,
        kind: "credits_low",
        message: creditsLowMessage(kind, left === 1 ? 1 : 0),
        detail:
          left === 0
            ? `They come back on ${creditsReturnDay(month)}.${billingEnabled() ? ` Or buy ${PURCHASES[PACK_FOR_KIND[kind]].credits} more on My uploads.` : ""}`
            : null,
        href: MEDIA_PAGE[GENERATION_PURPOSE[kind]],
      },
    ])
  }

  return { month, left, pot: "month" as const }
}

/** One bought credit, or the refusal when none is left. */
async function takePackCredit(
  tx: PomodoroTransaction,
  userId: string,
  kind: GenerationKind
) {
  await tx
    .insert(pomodoroPackUsage)
    .values({ userId, kind })
    .onConflictDoNothing()
  const [usage] = await tx
    .select()
    .from(pomodoroPackUsage)
    .where(and(eq(pomodoroPackUsage.userId, userId), eq(pomodoroPackUsage.kind, kind)))
    .for("update")
  if (!usage) throw new Error("GENERATION_LIMIT_REACHED")
  const left = (await boughtCredits(tx, userId, kind)) - (usage.reserved - usage.refunded)
  if (left <= 0) throw new Error("GENERATION_LIMIT_REACHED")
  await tx
    .update(pomodoroPackUsage)
    .set({ reserved: usage.reserved + 1, updatedAt: new Date() })
    .where(and(eq(pomodoroPackUsage.userId, userId), eq(pomodoroPackUsage.kind, kind)))
}

/**
 * Every credit of one kind the member has bought and kept. A refunded pack
 * no longer counts, so a refund takes back what is still unspent.
 */
export async function boughtCredits(
  database: CustomShellDb | PomodoroTransaction,
  userId: string,
  kind: GenerationKind
) {
  const product = PACK_FOR_KIND[kind]
  const [{ packs }] = await database
    .select({ packs: sql<number>`count(*)::int` })
    .from(pomodoroPurchases)
    .where(
      and(
        eq(pomodoroPurchases.userId, userId),
        eq(pomodoroPurchases.product, product),
        eq(pomodoroPurchases.status, "paid"),
        await inCurrentStripeMode(database)
      )
    )
  return packs * PURCHASES[product].credits
}

/** What is left of the member's bought credits of one kind. */
export async function packCreditsLeft(userId: string, kind: GenerationKind) {
  const [usage] = await db
    .select()
    .from(pomodoroPackUsage)
    .where(and(eq(pomodoroPackUsage.userId, userId), eq(pomodoroPackUsage.kind, kind)))
    .limit(1)
  const spent = usage ? usage.reserved - usage.refunded : 0
  return Math.max(0, (await boughtCredits(db, userId, kind)) - spent)
}

/**
 * The day a month's credits come back, said the way a person says it:
 * "1 November". Months are counted in UTC, the same as `generationMonth`.
 */
export function creditsReturnDay(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber, 1)))
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
  database: CustomShellDb | PomodoroTransaction = db,
  pot: string = "month"
) {
  if (pot === "pack") {
    await database
      .update(pomodoroPackUsage)
      .set(
        success
          ? { completed: sql`${pomodoroPackUsage.completed} + 1`, updatedAt: new Date() }
          : { refunded: sql`${pomodoroPackUsage.refunded} + 1`, updatedAt: new Date() }
      )
      .where(and(eq(pomodoroPackUsage.userId, userId), eq(pomodoroPackUsage.kind, kind)))
    return
  }
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

/** One request as a member sends it. */
export type GenerationRequest = {
  kind: GenerationKind
  prompt: string
  /** A style pill's key; backgrounds only (part 6). */
  style?: GenerationStyleKey | null
  /** One of the member's own ready pictures to animate (part 3). */
  pictureMediaId?: string | null
}

/**
 * Take the credits and queue the requests, in one transaction. One request
 * is the ordinary case. Two, one of each kind, is a whole look from one
 * prompt (task 06, part 7): both credits are taken together and both are
 * refused together when either kind is used up, and the two rows share a
 * `look_id` so the bell can wait for both. Credits are taken in a fixed
 * order, backgrounds first, so two looks at once cannot lock each other out.
 */
export async function requestGenerations(
  userId: string,
  requests: readonly GenerationRequest[],
  limits: Record<GenerationKind, number>,
  month = generationMonth()
) {
  const ordered = [...requests].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === "background" ? -1 : 1
  )
  const lookId = ordered.length > 1 ? randomUUID() : null
  return db.transaction(async (tx) => {
    const left: Partial<Record<GenerationKind, number>> = {}
    const pots: Partial<Record<GenerationKind, "month" | "pack">> = {}
    for (const request of ordered) {
      const taken = await takeCredit(
        tx,
        userId,
        request.kind,
        limits[request.kind],
        month
      )
      left[request.kind] = taken.left
      pots[request.kind] = taken.pot
    }
    const rows = await tx
      .insert(pomodoroGenerations)
      .values(
        ordered.map((request) => ({
          userId,
          kind: request.kind,
          prompt: request.prompt,
          month,
          style: request.kind === "background" ? (request.style ?? null) : null,
          fromPicture: Boolean(request.pictureMediaId),
          pictureMediaId: request.pictureMediaId ?? null,
          lookId,
          pot: pots[request.kind] ?? "month",
        }))
      )
      .returning()
    return { rows, left }
  })
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
  /** The style pill's label, shown beside the prompt (part 6). */
  styleLabel: string | null
  /** Started from one of the member's pictures (part 3). */
  fromPicture: boolean
  /** One half of a whole look (part 7). */
  inLook: boolean
  /**
   * Both halves of a look, once both are ready, so the line can offer "Use
   * both". Null otherwise.
   */
  look: {
    background: { mediaId: string; url: string }
    sound: { mediaId: string; url: string }
  } | null
  /** "2 ahead of you, about 4 minutes" while it waits its turn (part 5). */
  queuePlace: string | null
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
      style: pomodoroGenerations.style,
      fromPicture: pomodoroGenerations.fromPicture,
      lookId: pomodoroGenerations.lookId,
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

  const lookIds = rows.flatMap((row) => (row.lookId ? [row.lookId] : []))
  const [queue, looks] = await Promise.all([
    rows.some((row) => row.status === "queued") ? loadQueue() : [],
    lookIds.length ? loadReadyLooks(lookIds) : new Map(),
  ])

  const resolved = await Promise.all(
    rows.map(async ({ storagePath, style, lookId, ...row }) => ({
      ...row,
      kind: row.kind as GenerationKind,
      url:
        row.status === "ready" && storagePath
          ? await getPublicMediaUrl(storagePath)
          : "",
      styleLabel: generationStyle(style)?.label ?? null,
      inLook: lookId !== null,
      look: (lookId && looks.get(lookId)) || null,
      queuePlace:
        row.status === "queued" ? queuePlaceOf(row.id, row.createdAt, queue) : null,
    }))
  )
  // Read newest-first from the database so the limit keeps the recent ones,
  // then turned round so the panel reads in the order they were asked for.
  return resolved.reverse()
}

/** The most waiting requests the place in line is worked out over. */
const QUEUE_SCAN_LIMIT = 500

type QueuedJob = { id: string; kind: string; createdAt: Date }

/** Everything waiting or being made, across every member, oldest first. */
async function loadQueue(): Promise<QueuedJob[]> {
  return db
    .select({
      id: pomodoroGenerations.id,
      kind: pomodoroGenerations.kind,
      createdAt: pomodoroGenerations.createdAt,
    })
    .from(pomodoroGenerations)
    .where(inArray(pomodoroGenerations.status, ["queued", "running"]))
    .orderBy(pomodoroGenerations.createdAt)
    .limit(QUEUE_SCAN_LIMIT)
}

/**
 * Where one waiting request stands (task 06, part 5). The worker takes the
 * oldest first, one at a time, across both kinds, so everything older than
 * it, waiting or being made, is ahead of it. Each one ahead adds its kind's
 * typical time: 2 minutes for a background, 30 seconds for a soundscape.
 */
function queuePlaceOf(id: string, createdAt: Date, queue: QueuedJob[]) {
  let ahead = 0
  let seconds = 0
  for (const job of queue) {
    if (job.id === id || job.createdAt >= createdAt) continue
    ahead += 1
    seconds += TYPICAL_SECONDS[job.kind as GenerationKind] ?? 0
  }
  return describeQueuePlace(ahead, seconds)
}

/** The looks whose two halves are both ready, by look. */
async function loadReadyLooks(lookIds: string[]) {
  const halves = await db
    .select({
      lookId: pomodoroGenerations.lookId,
      kind: pomodoroGenerations.kind,
      mediaId: pomodoroGenerations.mediaId,
      storagePath: customShellMedia.storagePath,
    })
    .from(pomodoroGenerations)
    .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroGenerations.mediaId))
    .innerJoin(
      pomodoroMediaUploads,
      eq(pomodoroMediaUploads.mediaId, pomodoroGenerations.mediaId)
    )
    .where(
      and(
        inArray(pomodoroGenerations.lookId, lookIds),
        eq(pomodoroGenerations.status, "ready"),
        // A half in the bin is not offered: "Use both" would pick a file the
        // member threw away.
        isNull(pomodoroMediaUploads.deletedAt)
      )
    )

  const looks = new Map<string, NonNullable<GenerationRow["look"]>>()
  const byLook = new Map<string, typeof halves>()
  for (const half of halves) {
    if (!half.lookId) continue
    byLook.set(half.lookId, [...(byLook.get(half.lookId) ?? []), half])
  }
  for (const [lookId, pair] of byLook) {
    const background = pair.find((half) => half.kind === "background")
    const sound = pair.find((half) => half.kind === "soundscape")
    if (!background?.mediaId || !sound?.mediaId) continue
    looks.set(lookId, {
      background: {
        mediaId: background.mediaId,
        url: await getPublicMediaUrl(background.storagePath),
      },
      sound: {
        mediaId: sound.mediaId,
        url: await getPublicMediaUrl(sound.storagePath),
      },
    })
  }
  return looks
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
    const other = await lockLook(tx, job)
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
      tx,
      job.pot
    )
    await writeNotices(tx, finishedNotices(job, other))
    return { settled: true }
  })
}

/**
 * What the bell says when one request is done. A half of a look waits for
 * the other half and then says once that the look is ready (part 7); if the
 * other half gave up, this one is announced on its own, as any file is.
 */
function finishedNotices(
  job: PomodoroGeneration,
  other: PomodoroGeneration | null
) {
  if (!job.lookId || !other || other.status === "failed")
    return [generationNotice(job, true)]
  if (other.status !== "ready") return []
  return [lookNotice(job)]
}

/**
 * Both halves of a look, locked before either is changed, and always in the
 * same order, so a pass finishing one half and a pass giving up on the other
 * wait for each other instead of each announcing nothing. Returns the other
 * half as it stands, or null outside a look.
 */
async function lockLook(tx: PomodoroTransaction, job: PomodoroGeneration) {
  if (!job.lookId) return null
  const halves = await tx
    .select()
    .from(pomodoroGenerations)
    .where(eq(pomodoroGenerations.lookId, job.lookId))
    .orderBy(pomodoroGenerations.id)
    .for("update")
  return halves.find((half) => half.id !== job.id) ?? null
}

/** Both halves are ready. The line on My uploads offers "Use both". */
function lookNotice(job: PomodoroGeneration) {
  return {
    recipientUserId: job.userId,
    kind: "media_ready" as const,
    message: mediaReadyMessage("AI look"),
    detail: `${promptPreview(job.prompt)} Press Use both on My uploads.`,
    href: MEDIA_PAGE.background,
  }
}

/**
 * The notice a finished or abandoned AI request leaves in the bell. A retry is
 * not an ending, so only these two write one.
 */
function generationNotice(job: PomodoroGeneration, ready: boolean) {
  const kind = job.kind as GenerationKind
  const file = kind === "background" ? "AI background" : "AI soundscape"
  return {
    recipientUserId: job.userId,
    kind: ready ? ("media_ready" as const) : ("media_failed" as const),
    message: ready ? mediaReadyMessage(file) : mediaFailedMessage(file),
    detail: ready ? promptPreview(job.prompt) : "The credit is back.",
    href: MEDIA_PAGE[GENERATION_PURPOSE[kind]],
  }
}

/** The prompt, short enough for the line under a notice's heading. */
function promptPreview(prompt: string) {
  return prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt
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
    const other = await lockLook(tx, job)
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
        tx,
        job.pot
      )
      // Written with the refund, so a member is never told the credit is
      // back when it is not, or left without a word when it is. A look's
      // other half that was already made, and kept quiet waiting for this
      // one, is announced on its own now.
      await writeNotices(tx, [
        generationNotice(job, false),
        ...(other?.status === "ready" ? [generationNotice(other, true)] : []),
      ])
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
  const [left, packLeft] = await Promise.all([
    creditsLeft(userId, kind, limit),
    packCreditsLeft(userId, kind),
  ])
  return { limit, left, packLeft }
}
