import { and, arrayOverlaps, asc, eq, lte, sql } from "drizzle-orm"

import {
  parseAudienceFilter,
  parseStoredBlocks,
  safeLinkUrl,
  type BroadcastAudienceFilter,
} from "@/lib/broadcasts/blocks"
import {
  isWithinDripWindow,
  nextDripWindowOpen,
  parseDripConfig,
  pickBatchSize,
  pickWaitMs,
  validateDripConfig,
} from "@/lib/broadcasts/drip"
import {
  personalizeEmail,
  renderBroadcastEmailHtml,
} from "@/lib/broadcasts/render"
import { getWorkspaceBroadcast } from "@/server/email/broadcasts"
import {
  getSegmentDefinition,
  segmentConditions,
} from "@/server/people/contact-segments"
import { syncContactsFromUsers } from "@/server/people/contacts"
import { db, type CustomShellDb } from "@/server/db"
import { getEmailProvider } from "@/server/email/provider"
import { getSendableEmailConfig } from "@/server/email/settings"
import {
  customShellBroadcasts,
  customShellContacts,
  customShellDeliveries,
  type CustomShellBroadcast,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import {
  buildUnsubscribeUrl,
  canBuildUnsubscribeLinks,
} from "@/server/email/unsubscribe"

/** How many broadcasts one pass of the ticker will pick up. */
const CLAIM_LIMIT_PER_TICK = 3
/** A claim left by a server that died is up for grabs again after this long. */
const CLAIM_TIMEOUT_MINUTES = 5
/** Long batches touch their claim as they go so it never goes stale mid-batch. */
const CLAIM_REFRESH_EVERY = 20
/**
 * People per batch when the send is not paced. The send resumes at the next one
 * if anything interrupts it. A paced send picks its own size — see
 * `src/lib/broadcasts/drip.ts`.
 */
const BATCH_SIZE = 50
/** Below this many attempts, the failure guard has too little to judge on. */
const FAILURE_SAMPLE_MINIMUM = 20
/** Stop and ask for help once this share of attempts have failed. */
const FAILURE_THRESHOLD_PERCENT = 50

type AudienceContact = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
}

/**
 * Who this newsletter is for, as a database condition.
 *
 * A segment is not copied out into rules of its own here — it calls the segment
 * code. That is what makes the number in the send window and the people who
 * actually get the email one answer to one question rather than two that drift.
 *
 * Whatever the audience says, "still on the list" is always on top of it. A
 * segment can narrow who gets an email; it can never widen it.
 */
async function audienceConditions(
  workspaceId: string,
  filter: BroadcastAudienceFilter,
  database: CustomShellDb
) {
  const conditions = [
    eq(customShellContacts.workspaceId, workspaceId),
    // Anybody who unsubscribed is simply not in the audience — there is no
    // second place that has to remember to skip them.
    eq(customShellContacts.status, "subscribed"),
  ]
  if (filter.kind === "tags") {
    conditions.push(arrayOverlaps(customShellContacts.tags, filter.tags))
  }
  if (filter.kind === "segment") {
    const segment = await getSegmentDefinition(
      workspaceId,
      filter.segmentId,
      database
    )
    // The one failure this file refuses to guess at. Carrying on without the
    // condition would mail the whole list, so it stops instead.
    if (!segment) throw new Error("SEGMENT_GONE")
    conditions.push(await segmentConditions(workspaceId, segment, database))
  }
  return and(...conditions)
}

async function resolveBroadcastAudience(
  workspaceId: string,
  filter: BroadcastAudienceFilter,
  database: CustomShellDb = db
): Promise<AudienceContact[]> {
  return database
    .select({
      id: customShellContacts.id,
      email: customShellContacts.email,
      firstName: customShellContacts.firstName,
      lastName: customShellContacts.lastName,
    })
    .from(customShellContacts)
    .where(await audienceConditions(workspaceId, filter, database))
    .orderBy(asc(customShellContacts.createdAt), asc(customShellContacts.id))
}

export async function countBroadcastAudience(
  workspaceId: string,
  filter: BroadcastAudienceFilter,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(customShellContacts)
    .where(await audienceConditions(workspaceId, filter, database))
  return row?.total ?? 0
}

async function requireBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb
) {
  const broadcast = await getWorkspaceBroadcast(
    workspaceId,
    broadcastId,
    database
  )
  if (!broadcast) throw new Error("NOT_FOUND")
  return broadcast
}

/** Everything that must be true before a single message goes out. */
async function validateReadyToSend(
  broadcast: CustomShellBroadcast,
  database: CustomShellDb
) {
  if (!broadcast.subject.trim()) throw new Error("SUBJECT_REQUIRED")

  const blocks = parseStoredBlocks(broadcast.blocks)
  if (blocks.length === 0) throw new Error("BLOCKS_REQUIRED")

  // Caught here rather than at the first batch. Settings that contradict
  // themselves would otherwise be found by the ticker, which has nobody to tell.
  if (validateDripConfig(parseDripConfig(broadcast.dripConfig))) {
    throw new Error("DRIP_SETTINGS_INVALID")
  }

  // A button with no usable address falls back to the link the app builds for
  // its own emails, and a newsletter has no such link — so it would arrive
  // pointing at the placeholder itself. Refused here rather than sent broken.
  // `safeLinkUrl`, not a blank check: an address the save already emptied for
  // being an unusable scheme has to fail the same way.
  if (
    blocks.some(
      (block) => block.kind === "button" && !safeLinkUrl(block.content.url)
    )
  ) {
    throw new Error("BUTTON_WITHOUT_LINK")
  }

  const config = await getSendableEmailConfig(broadcast.workspaceId, database)
  if (!config) throw new Error("EMAIL_NOT_CONFIGURED")

  // Asked here, not inside the delivery loop. Every message carries a signed
  // unsubscribe link, so without the key there is nothing to send — and a
  // throw mid-batch would leave the broadcast retrying every fifteen seconds
  // for ever, delivering nothing and saying nothing about why.
  if (!canBuildUnsubscribeLinks()) throw new Error("UNSUBSCRIBE_NOT_CONFIGURED")

  const audienceCount = await countBroadcastAudience(
    broadcast.workspaceId,
    parseAudienceFilter(broadcast.audienceFilter),
    database
  )
  if (audienceCount === 0) throw new Error("NO_AUDIENCE")

  return {
    audienceCount,
    renderedHtml: renderBroadcastEmailHtml(blocks, {
      preheader: broadcast.preheader,
    }),
  }
}

/** Moves a draft or scheduled broadcast into 'sending'; the ticker delivers. */
export async function startBroadcastSendNow(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "draft" && broadcast.status !== "scheduled") {
    throw new Error("NOT_SENDABLE")
  }
  const { audienceCount, renderedHtml } = await validateReadyToSend(
    broadcast,
    database
  )

  await database
    .update(customShellBroadcasts)
    .set({
      status: "sending",
      renderedHtml,
      scheduledAt: null,
      nextBatchAt: null,
      pausedReason: null,
      totalRecipients: audienceCount,
      updatedAt: now(),
    })
    .where(eq(customShellBroadcasts.id, broadcast.id))

  kickBroadcastProcessing(database)
}

export async function scheduleBroadcast(
  workspaceId: string,
  broadcastId: string,
  scheduledAt: Date,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "draft" && broadcast.status !== "scheduled") {
    throw new Error("NOT_SENDABLE")
  }
  if (scheduledAt.getTime() <= now().getTime()) throw new Error("TIME_IN_PAST")

  const { audienceCount, renderedHtml } = await validateReadyToSend(
    broadcast,
    database
  )

  await database
    .update(customShellBroadcasts)
    .set({
      status: "scheduled",
      renderedHtml,
      scheduledAt,
      nextBatchAt: null,
      pausedReason: null,
      totalRecipients: audienceCount,
      updatedAt: now(),
    })
    .where(eq(customShellBroadcasts.id, broadcast.id))
}

export async function cancelBroadcastSchedule(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "scheduled") throw new Error("NOT_SCHEDULED")

  await database
    .update(customShellBroadcasts)
    .set({ status: "draft", scheduledAt: null, updatedAt: now() })
    .where(eq(customShellBroadcasts.id, broadcast.id))
}

export async function pauseBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "sending") throw new Error("NOT_SENDING")

  await database
    .update(customShellBroadcasts)
    .set({ status: "paused", pausedReason: "Paused by hand", updatedAt: now() })
    .where(eq(customShellBroadcasts.id, broadcast.id))
}

export async function resumeBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "paused") throw new Error("NOT_PAUSED")

  await database
    .update(customShellBroadcasts)
    .set({
      status: "sending",
      pausedReason: null,
      nextBatchAt: null,
      updatedAt: now(),
    })
    .where(eq(customShellBroadcasts.id, broadcast.id))

  kickBroadcastProcessing(database)
}

/** Sends one copy to a chosen address, so the real thing can be checked first. */
export async function sendTestBroadcast(
  workspaceId: string,
  broadcastId: string,
  toEmail: string,
  database: CustomShellDb = db
): Promise<{ ok: boolean; error?: string }> {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  const blocks = parseStoredBlocks(broadcast.blocks)
  if (blocks.length === 0) throw new Error("BLOCKS_REQUIRED")

  const config = await getSendableEmailConfig(workspaceId, database)
  if (!config) throw new Error("EMAIL_NOT_CONFIGURED")
  if (!canBuildUnsubscribeLinks()) throw new Error("UNSUBSCRIBE_NOT_CONFIGURED")

  const html = renderBroadcastEmailHtml(blocks, {
    preheader: broadcast.preheader,
  })
  const sampleContact = {
    email: toEmail,
    firstName: "Test",
    lastName: "Contact",
  }
  const from = broadcast.fromName
    ? `${broadcast.fromName} <${config.fromEmail}>`
    : config.from

  const result = await getEmailProvider(config.apiKey).send({
    from,
    to: toEmail,
    subject: `[TEST] ${personalizeEmail(broadcast.subject || broadcast.name, sampleContact, { html: false })}`,
    html: personalizeEmail(html, sampleContact, {
      html: true,
      unsubscribeUrl: buildUnsubscribeUrl("test-contact"),
    }),
  })

  return result.success
    ? { ok: true }
    : { ok: false, error: result.error ?? "The test send did not go through" }
}

/**
 * What the ticker calls: promote any scheduled broadcast that has come due,
 * claim the ones that are sending, and deliver one batch of each.
 *
 * Same claim-token pattern as automation runs, so two ticks that overlap are
 * harmless — each only ever writes back to rows still carrying its own token.
 */
export async function processDueBroadcasts(
  database: CustomShellDb = db,
  nowFn: () => Date = now
) {
  const timestamp = nowFn()

  await database
    .update(customShellBroadcasts)
    .set({ status: "sending", nextBatchAt: null, updatedAt: timestamp })
    .where(
      and(
        eq(customShellBroadcasts.status, "scheduled"),
        lte(customShellBroadcasts.scheduledAt, timestamp)
      )
    )

  const claimToken = uuid()
  const staleBefore = new Date(
    timestamp.getTime() - CLAIM_TIMEOUT_MINUTES * 60_000
  )
  const claimed = await database.execute(sql`
    UPDATE broadcasts
    SET claim_token = ${claimToken}, claimed_at = ${timestamp}, updated_at = ${timestamp}
    WHERE id IN (
      SELECT id FROM broadcasts
      WHERE status = 'sending'
        AND (next_batch_at IS NULL OR next_batch_at <= ${timestamp})
        AND (claimed_at IS NULL OR claimed_at < ${staleBefore})
      ORDER BY updated_at ASC
      LIMIT ${CLAIM_LIMIT_PER_TICK}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `)

  const ids = (claimed.rows as Array<{ id: string }>).map((row) => row.id)

  let processed = 0
  let failed = 0
  for (const id of ids) {
    try {
      await processBroadcastBatch(id, claimToken, database, nowFn)
      processed += 1
    } catch (error) {
      console.error(`Broadcast ${id} batch failed`, error)
      failed += 1
      // The claim is left to go stale; the next tick picks it up again.
    }
  }

  return { processed, failed }
}

async function processBroadcastBatch(
  broadcastId: string,
  claimToken: string,
  database: CustomShellDb,
  nowFn: () => Date
) {
  const [broadcast] = await database
    .select()
    .from(customShellBroadcasts)
    .where(
      and(
        eq(customShellBroadcasts.id, broadcastId),
        eq(customShellBroadcasts.claimToken, claimToken)
      )
    )
    .limit(1)
  if (!broadcast) return

  const release = async (
    values: Partial<typeof customShellBroadcasts.$inferInsert>
  ) => {
    await database
      .update(customShellBroadcasts)
      .set({ ...values, claimToken: null, claimedAt: null, updatedAt: nowFn() })
      .where(
        and(
          eq(customShellBroadcasts.id, broadcastId),
          eq(customShellBroadcasts.claimToken, claimToken)
        )
      )
  }

  const config = await getSendableEmailConfig(broadcast.workspaceId, database)
  if (!config) {
    await release({
      status: "paused",
      pausedReason: "Email is not set up for this workspace yet",
    })
    return
  }

  // A key that went missing after the send started. Pause and say so rather
  // than throwing out of the batch and retrying for ever.
  if (!canBuildUnsubscribeLinks()) {
    await release({
      status: "paused",
      pausedReason:
        "Unsubscribe links cannot be signed on this server, so nothing can go out. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY, then start it again.",
    })
    return
  }

  // Paced sends stop here outside their hours. Checked before the audience is
  // resolved, because that is several queries and a contact sync, and none of
  // it is worth doing for a newsletter that is not allowed to send yet.
  //
  // The status stays 'sending' — it is asleep, not stopped — and `next_batch_at`
  // points at the real opening, so it is not looked at again until then rather
  // than being picked up and put down every fifteen seconds all night.
  const drip = parseDripConfig(broadcast.dripConfig)
  if (drip.enabled && !isWithinDripWindow(drip, nowFn())) {
    await release({ nextBatchAt: nextDripWindowOpen(drip, nowFn()) })
    return
  }

  // Anybody who signed up since the last batch is in this one. Deliveries are
  // keyed on the contact, so somebody who was already mailed is still skipped.
  await syncContactsFromUsers(broadcast.workspaceId, database)

  // The audience is worked out fresh for every batch, not frozen when Send was
  // pressed. That is what makes a segment worth pointing at: somebody who opts
  // out halfway through simply stops being in it.
  let audience: AudienceContact[]
  try {
    audience = await resolveBroadcastAudience(
      broadcast.workspaceId,
      parseAudienceFilter(broadcast.audienceFilter),
      database
    )
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "SEGMENT_GONE") throw error
    // Pause and say so, rather than throwing out of the batch — a throw leaves
    // the claim to go stale and the ticker retrying every fifteen seconds for
    // ever, telling nobody why nothing is arriving.
    await release({
      status: "paused",
      pausedReason:
        "The segment this was going to has been deleted, so nothing more can go out. Pick who it is for again, then start it.",
    })
    return
  }

  const deliveredRows = await database
    .select({ contactId: customShellDeliveries.contactId })
    .from(customShellDeliveries)
    .where(eq(customShellDeliveries.broadcastId, broadcastId))
  const deliveredIds = new Set(deliveredRows.map((row) => row.contactId))
  const unsent = audience.filter((contact) => !deliveredIds.has(contact.id))

  const finalizeTotals = async () => {
    const [counts] = await database
      .select({
        sent: sql<number>`count(*) filter (where ${customShellDeliveries.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${customShellDeliveries.status} = 'failed')::int`,
        // Reported by Resend some time after the send, so this climbs between
        // batches without anything here having sent a thing.
        bounced: sql<number>`count(*) filter (where ${customShellDeliveries.bouncedAt} is not null)::int`,
      })
      .from(customShellDeliveries)
      .where(eq(customShellDeliveries.broadcastId, broadcastId))
    return {
      sent: counts?.sent ?? 0,
      failed: counts?.failed ?? 0,
      bounced: counts?.bounced ?? 0,
    }
  }

  const totalRecipients = Math.max(
    broadcast.totalRecipients,
    audience.length,
    deliveredIds.size
  )

  if (unsent.length === 0) {
    const totals = await finalizeTotals()
    await release({
      status: "sent",
      sentAt: nowFn(),
      totalRecipients,
      totalSent: totals.sent,
      totalFailed: totals.failed,
    })
    return
  }

  const batch = unsent.slice(0, drip.enabled ? pickBatchSize(drip) : BATCH_SIZE)
  const html =
    broadcast.renderedHtml ||
    renderBroadcastEmailHtml(parseStoredBlocks(broadcast.blocks), {
      preheader: broadcast.preheader,
    })
  const from = broadcast.fromName
    ? `${broadcast.fromName} <${config.fromEmail}>`
    : config.from
  const provider = getEmailProvider(config.apiKey)

  let stopped = false
  for (const [index, contact] of batch.entries()) {
    if (index > 0 && index % CLAIM_REFRESH_EVERY === 0) {
      await database
        .update(customShellBroadcasts)
        .set({ claimedAt: nowFn() })
        .where(
          and(
            eq(customShellBroadcasts.id, broadcastId),
            eq(customShellBroadcasts.claimToken, claimToken)
          )
        )
    }

    // Pause lands between two messages, never in the middle of one.
    const [current] = await database
      .select({ status: customShellBroadcasts.status })
      .from(customShellBroadcasts)
      .where(eq(customShellBroadcasts.id, broadcastId))
      .limit(1)
    if (!current || current.status !== "sending") {
      stopped = true
      break
    }

    const unsubscribeUrl = buildUnsubscribeUrl(contact.id)
    let status: "sent" | "failed"
    let providerMessageId: string | null = null
    let errorMessage: string | null = null
    const subject = personalizeEmail(broadcast.subject, contact, { html: false })
    try {
      const result = await provider.send({
        from,
        to: contact.email,
        subject,
        html: personalizeEmail(html, contact, { html: true, unsubscribeUrl }),
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      })
      status = result.success ? "sent" : "failed"
      providerMessageId = result.messageId ?? null
      errorMessage = result.success
        ? null
        : (result.error ?? "The send did not go through")
    } catch (error) {
      status = "failed"
      errorMessage = error instanceof Error ? error.message : String(error)
    }

    // The unique index makes this do nothing if another pass already recorded
    // this person — one send each, even across a stale claim being retaken.
    await database
      .insert(customShellDeliveries)
      .values({
        id: uuid(),
        workspaceId: broadcast.workspaceId,
        broadcastId,
        contactId: contact.id,
        toEmail: contact.email,
        subject,
        providerMessageId,
        status,
        error: errorMessage,
        createdAt: nowFn(),
      })
      .onConflictDoNothing()
  }

  const totals = await finalizeTotals()
  const attempts = totals.sent + totals.failed
  const failureRate = attempts > 0 ? (totals.failed / attempts) * 100 : 0
  const counters = {
    totalRecipients,
    totalSent: totals.sent,
    totalFailed: totals.failed,
    batchesSent: broadcast.batchesSent + 1,
  }

  if (stopped) {
    // Whatever paused it keeps its status; only the counts are refreshed.
    await release(counters)
    return
  }

  if (
    attempts >= FAILURE_SAMPLE_MINIMUM &&
    failureRate >= FAILURE_THRESHOLD_PERCENT
  ) {
    await release({
      ...counters,
      status: "paused",
      pausedReason: `Stopped on its own: ${totals.failed} of ${attempts} sends failed. Check your email settings, then start it again.`,
    })
    return
  }

  // Bounces are the other way this goes wrong, and the quieter one: every send
  // succeeds, and the addresses turn out not to exist. Enough of those and the
  // sending domain is in trouble, so a paced send stops itself and says so.
  //
  // Measured against sends that went through rather than against everyone
  // written down, because a message that never left cannot bounce. Same
  // twenty-send floor as the failure rule above — three bounces out of four is
  // a small list, not a bad one.
  const bounceRate =
    totals.sent > 0 ? (totals.bounced / totals.sent) * 100 : 0
  if (
    drip.enabled &&
    totals.sent >= FAILURE_SAMPLE_MINIMUM &&
    bounceRate >= drip.bounceThresholdPercent
  ) {
    await release({
      ...counters,
      status: "paused",
      pausedReason: `Stopped on its own: ${totals.bounced} of the ${totals.sent} sent so far bounced, which is over your ${drip.bounceThresholdPercent} in 100 limit. Clean up the list before starting it again.`,
    })
    return
  }

  if (batch.length >= unsent.length) {
    await release({ ...counters, status: "sent", sentAt: nowFn() })
    return
  }

  // More to go. Without pacing that is "straight away", which is what the
  // claim query reads a null as; with it, the wait is picked fresh each time so
  // the gaps between batches are not identical.
  await release({
    ...counters,
    nextBatchAt: drip.enabled
      ? new Date(nowFn().getTime() + pickWaitMs(drip))
      : null,
  })
}

/**
 * Starts a pass straight away so "Send now" begins within the same second
 * instead of waiting for the next tick. Deliberately not awaited. Tests drive
 * the loop themselves, so it stays out of their way.
 */
function kickBroadcastProcessing(database: CustomShellDb) {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return
  processDueBroadcasts(database).catch((error) => {
    console.error("Broadcast kick failed", error)
  })
}
