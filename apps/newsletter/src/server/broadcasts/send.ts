import { and, arrayOverlaps, asc, eq, lte, sql } from "drizzle-orm"

import {
  parseAudienceFilter,
  parseStoredBlocks,
  type BroadcastAudienceFilter,
} from "@/lib/broadcasts/blocks"
import { isWithinSendWindow, parseDripConfig } from "@/lib/broadcasts/drip"
import {
  personalizeEmail,
  renderBroadcastEmailHtml,
} from "@/lib/broadcasts/render"
import { getWorkspaceBroadcast } from "@/server/broadcasts/crud"
import { buildUnsubscribeUrl } from "@/server/broadcasts/unsubscribe"
import { db, type CustomShellDb } from "@/server/db"
import { getEmailProvider } from "@/server/email-provider"
import { getSendableEmailConfig } from "@/server/email-settings"
import {
  newsletterBroadcasts,
  newsletterContacts,
  newsletterDeliveries,
  type NewsletterBroadcast,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

const CLAIM_LIMIT_PER_TICK = 3
const CLAIM_TIMEOUT_MINUTES = 5
const CLAIM_REFRESH_EVERY = 20
const NON_DRIP_BATCH_SIZE = 50
const OUTSIDE_WINDOW_RETRY_MINUTES = 5
/** Minimum attempts before the failure-rate guard may auto-pause. */
const FAILURE_SAMPLE_MINIMUM = 20
/** Failure-rate ceiling for non-drip sends (drip mode uses its own setting). */
const NON_DRIP_FAILURE_THRESHOLD_PERCENT = 50

type AudienceContact = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
}

function audienceConditions(
  workspaceId: string,
  filter: BroadcastAudienceFilter
) {
  const conditions = [
    eq(newsletterContacts.workspaceId, workspaceId),
    eq(newsletterContacts.status, "subscribed"),
  ]
  if (filter.kind === "tags") {
    conditions.push(arrayOverlaps(newsletterContacts.tags, filter.tags))
  }
  return and(...conditions)
}

export async function resolveBroadcastAudience(
  workspaceId: string,
  filter: BroadcastAudienceFilter,
  database: CustomShellDb = db
): Promise<AudienceContact[]> {
  return database
    .select({
      id: newsletterContacts.id,
      email: newsletterContacts.email,
      firstName: newsletterContacts.firstName,
      lastName: newsletterContacts.lastName,
    })
    .from(newsletterContacts)
    .where(audienceConditions(workspaceId, filter))
    .orderBy(asc(newsletterContacts.createdAt), asc(newsletterContacts.id))
}

export async function countBroadcastAudience(
  workspaceId: string,
  filter: BroadcastAudienceFilter,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(newsletterContacts)
    .where(audienceConditions(workspaceId, filter))
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
  if (!broadcast) throw new Error("Broadcast not found")
  return broadcast
}

async function validateReadyToSend(
  broadcast: NewsletterBroadcast,
  database: CustomShellDb
) {
  if (!broadcast.subject.trim()) {
    throw new Error("Add a subject before sending")
  }
  const blocks = parseStoredBlocks(broadcast.blocks)
  if (blocks.length === 0) {
    throw new Error("Add at least one content block before sending")
  }
  const config = await getSendableEmailConfig(broadcast.workspaceId, database)
  if (!config) {
    throw new Error("Email settings are not configured")
  }
  const audienceCount = await countBroadcastAudience(
    broadcast.workspaceId,
    parseAudienceFilter(broadcast.audienceFilter),
    database
  )
  if (audienceCount === 0) {
    throw new Error("No contacts match this audience")
  }
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
    throw new Error("Only a draft or scheduled broadcast can be sent")
  }
  const { audienceCount, renderedHtml } = await validateReadyToSend(
    broadcast,
    database
  )

  await database
    .update(newsletterBroadcasts)
    .set({
      status: "sending",
      renderedHtml,
      scheduledAt: null,
      nextBatchAt: null,
      pausedReason: null,
      totalRecipients: audienceCount,
      updatedAt: now(),
    })
    .where(eq(newsletterBroadcasts.id, broadcast.id))

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
    throw new Error("Only a draft or scheduled broadcast can be scheduled")
  }
  if (scheduledAt.getTime() <= now().getTime()) {
    throw new Error("Pick a time in the future")
  }
  const { audienceCount, renderedHtml } = await validateReadyToSend(
    broadcast,
    database
  )

  await database
    .update(newsletterBroadcasts)
    .set({
      status: "scheduled",
      renderedHtml,
      scheduledAt,
      nextBatchAt: null,
      pausedReason: null,
      totalRecipients: audienceCount,
      updatedAt: now(),
    })
    .where(eq(newsletterBroadcasts.id, broadcast.id))
}

export async function cancelBroadcastSchedule(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "scheduled") {
    throw new Error("Broadcast is not scheduled")
  }
  await database
    .update(newsletterBroadcasts)
    .set({ status: "draft", scheduledAt: null, updatedAt: now() })
    .where(eq(newsletterBroadcasts.id, broadcast.id))
}

export async function pauseBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "sending") {
    throw new Error("Broadcast is not currently sending")
  }
  await database
    .update(newsletterBroadcasts)
    .set({ status: "paused", pausedReason: "Paused manually", updatedAt: now() })
    .where(eq(newsletterBroadcasts.id, broadcast.id))
}

export async function resumeBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  if (broadcast.status !== "paused") {
    throw new Error("Broadcast is not paused")
  }
  await database
    .update(newsletterBroadcasts)
    .set({
      status: "sending",
      pausedReason: null,
      nextBatchAt: null,
      updatedAt: now(),
    })
    .where(eq(newsletterBroadcasts.id, broadcast.id))

  kickBroadcastProcessing(database)
}

export async function sendTestBroadcast(
  workspaceId: string,
  broadcastId: string,
  toEmail: string,
  database: CustomShellDb = db
): Promise<{ ok: boolean; error?: string }> {
  const broadcast = await requireBroadcast(workspaceId, broadcastId, database)
  const blocks = parseStoredBlocks(broadcast.blocks)
  if (blocks.length === 0) {
    throw new Error("Add at least one content block before sending")
  }
  const config = await getSendableEmailConfig(workspaceId, database)
  if (!config) {
    throw new Error("Email settings are not configured")
  }

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

  const provider = getEmailProvider(config.apiKey)
  const result = await provider.send({
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
    : { ok: false, error: result.error ?? "Test send failed" }
}

/**
 * Ticker hook: promotes due scheduled broadcasts, claims due sending
 * broadcasts, and delivers one batch per broadcast per pass. Uses the same
 * claim-token pattern as automation runs so overlapping ticks are safe.
 */
export async function processDueBroadcasts(
  database: CustomShellDb = db,
  nowFn: () => Date = now
) {
  const timestamp = nowFn()

  await database
    .update(newsletterBroadcasts)
    .set({ status: "sending", nextBatchAt: null, updatedAt: timestamp })
    .where(
      and(
        eq(newsletterBroadcasts.status, "scheduled"),
        lte(newsletterBroadcasts.scheduledAt, timestamp)
      )
    )

  const claimToken = uuid()
  const staleBefore = new Date(
    timestamp.getTime() - CLAIM_TIMEOUT_MINUTES * 60_000
  )
  const claimed = await database.execute(sql`
    UPDATE newsletter_broadcasts
    SET claim_token = ${claimToken}, claimed_at = ${timestamp}, updated_at = ${timestamp}
    WHERE id IN (
      SELECT id FROM newsletter_broadcasts
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
      // Leave the stale claim to expire; the next tick retries.
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
    .from(newsletterBroadcasts)
    .where(
      and(
        eq(newsletterBroadcasts.id, broadcastId),
        eq(newsletterBroadcasts.claimToken, claimToken)
      )
    )
    .limit(1)
  if (!broadcast) return

  const release = async (
    values: Partial<typeof newsletterBroadcasts.$inferInsert>
  ) => {
    await database
      .update(newsletterBroadcasts)
      .set({
        ...values,
        claimToken: null,
        claimedAt: null,
        updatedAt: nowFn(),
      })
      .where(
        and(
          eq(newsletterBroadcasts.id, broadcastId),
          eq(newsletterBroadcasts.claimToken, claimToken)
        )
      )
  }

  const config = await getSendableEmailConfig(broadcast.workspaceId, database)
  if (!config) {
    await release({
      status: "paused",
      pausedReason: "Email settings are not configured",
    })
    return
  }

  const drip = parseDripConfig(broadcast.dripConfig)
  if (drip.enabled && !isWithinSendWindow(drip, nowFn())) {
    await release({
      nextBatchAt: new Date(
        nowFn().getTime() + OUTSIDE_WINDOW_RETRY_MINUTES * 60_000
      ),
    })
    return
  }

  const audience = await resolveBroadcastAudience(
    broadcast.workspaceId,
    parseAudienceFilter(broadcast.audienceFilter),
    database
  )
  const deliveredRows = await database
    .select({ contactId: newsletterDeliveries.contactId })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.broadcastId, broadcastId))
  const deliveredIds = new Set(deliveredRows.map((row) => row.contactId))
  const unsent = audience.filter((contact) => !deliveredIds.has(contact.id))

  const finalizeTotals = async () => {
    const [counts] = await database
      .select({
        sent: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'failed')::int`,
      })
      .from(newsletterDeliveries)
      .where(eq(newsletterDeliveries.broadcastId, broadcastId))
    return { sent: counts?.sent ?? 0, failed: counts?.failed ?? 0 }
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

  const batchSize = drip.enabled
    ? randomInt(drip.batchSizeMin, drip.batchSizeMax)
    : NON_DRIP_BATCH_SIZE
  const batch = unsent.slice(0, batchSize)
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
        .update(newsletterBroadcasts)
        .set({ claimedAt: nowFn() })
        .where(
          and(
            eq(newsletterBroadcasts.id, broadcastId),
            eq(newsletterBroadcasts.claimToken, claimToken)
          )
        )
    }

    // A pause or delete lands between sends, not mid-request.
    const [current] = await database
      .select({ status: newsletterBroadcasts.status })
      .from(newsletterBroadcasts)
      .where(eq(newsletterBroadcasts.id, broadcastId))
      .limit(1)
    if (!current || current.status !== "sending") {
      stopped = true
      break
    }

    const unsubscribeUrl = buildUnsubscribeUrl(contact.id)
    let status: "sent" | "failed"
    let providerMessageId: string | null = null
    let errorMessage: string | null = null
    const subject = personalizeEmail(broadcast.subject, contact, {
      html: false,
    })
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
      errorMessage = result.success ? null : (result.error ?? "Send failed")
    } catch (error) {
      status = "failed"
      errorMessage = error instanceof Error ? error.message : String(error)
    }

    // The partial unique index makes this a no-op if another pass already
    // recorded this contact — exactly-one-send even across stale reclaims.
    await database
      .insert(newsletterDeliveries)
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
  const failureThreshold = drip.enabled
    ? drip.failureThresholdPercent
    : NON_DRIP_FAILURE_THRESHOLD_PERCENT
  const counters = {
    totalRecipients,
    totalSent: totals.sent,
    totalFailed: totals.failed,
    batchesSent: broadcast.batchesSent + 1,
  }

  if (stopped) {
    // Keep whatever status the pause/delete set; only refresh counters.
    await release(counters)
    return
  }

  if (attempts >= FAILURE_SAMPLE_MINIMUM && failureRate >= failureThreshold) {
    await release({
      ...counters,
      status: "paused",
      pausedReason: `Auto-paused: ${totals.failed} of ${attempts} sends failed (${failureRate.toFixed(1)}%). Check your email settings, then resume.`,
    })
    return
  }

  if (batch.length >= unsent.length) {
    await release({
      ...counters,
      status: "sent",
      sentAt: nowFn(),
    })
    return
  }

  await release({
    ...counters,
    nextBatchAt: drip.enabled
      ? new Date(
          nowFn().getTime() +
            randomInt(drip.intervalMinMinutes, drip.intervalMaxMinutes) *
              60_000
        )
      : null,
  })
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Fire-and-forget pass so "Send now" starts within the same second instead
 * of waiting for the next ticker interval. Tests drive the loop directly.
 */
function kickBroadcastProcessing(database: CustomShellDb) {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return
  processDueBroadcasts(database).catch((error) => {
    console.error("Broadcast kick failed", error)
  })
}
