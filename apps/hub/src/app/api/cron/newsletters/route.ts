import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newsletters, newsletterContacts, newsletterSegmentContacts, newsletterEvents, sites, authUsers } from '@/lib/db/schema'
import { eq, and, lte, inArray, or, sql } from 'drizzle-orm'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { getEmailProvider, type EmailProvider } from '@/lib/actions/email/provider'
import { randomUUID } from 'crypto'

const BATCH_SIZE = 50
const DELIVERY_LOCK_TIMEOUT_MS = 10 * 60 * 1000

function clearDeliveryLock(metadata: Record<string, any> | null | undefined) {
  const next = { ...(metadata || {}) }
  delete next.delivery_lock_token
  delete next.delivery_lock_started_at
  return next
}

async function acquireDeliveryLock(newsletterId: string, metadata: Record<string, any> | null | undefined) {
  const token = randomUUID()
  const startedAt = new Date().toISOString()
  const staleBefore = new Date(Date.now() - DELIVERY_LOCK_TIMEOUT_MS).toISOString()
  const [row] = await db
    .update(newsletters)
    .set({
      metadata: {
        ...(metadata || {}),
        delivery_lock_token: token,
        delivery_lock_started_at: startedAt,
      },
    })
    .where(and(
      eq(newsletters.id, newsletterId),
      or(
        sql`${newsletters.metadata}->>'delivery_lock_token' is null`,
        sql`${newsletters.metadata}->>'delivery_lock_started_at' is null`,
        sql`(${newsletters.metadata}->>'delivery_lock_started_at')::timestamptz < ${staleBefore}::timestamptz`,
      ),
    ))
    .returning({ id: newsletters.id })

  return row ? { token } : null
}

async function releaseDeliveryLock(
  newsletterId: string,
  token: string,
) {
  await db
    .update(newsletters)
    .set({ metadata: sql`coalesce(${newsletters.metadata}, '{}'::jsonb) - 'delivery_lock_token' - 'delivery_lock_started_at'` })
    .where(and(
      eq(newsletters.id, newsletterId),
      sql`${newsletters.metadata}->>'delivery_lock_token' = ${token}`,
    ))
}

async function isNewsletterPaused(newsletterId: string) {
  const [row] = await db
    .select({ status: newsletters.status })
    .from(newsletters)
    .where(eq(newsletters.id, newsletterId))
    .limit(1)

  return row?.status === 'paused'
}

/**
 * GET /api/cron/newsletters
 * Process scheduled/sending newsletters in batches.
 * - 'scheduled' newsletters with scheduled_at <= now get moved to 'sending'
 * - 'sending' newsletters: drip-enabled use randomized batch sizes + intervals,
 *   non-drip use fixed BATCH_SIZE of 50
 * - Auto-pauses on bounce threshold exceeded + sends admin email notification
 * - When all contacts are sent, status moves to 'sent'
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Move scheduled newsletters to sending
    await db
      .update(newsletters)
      .set({ status: 'sending' })
      .where(and(eq(newsletters.status, 'scheduled'), lte(newsletters.scheduledAt, now)))

    // Get newsletters that are currently sending
    const sendingNewsletters = await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.status, 'sending'))

    if (!sendingNewsletters.length) {
      return NextResponse.json({ message: 'No newsletters to process', processed: 0 })
    }

    let totalProcessed = 0

    for (const newsletter of sendingNewsletters) {
      const meta = newsletter.metadata as Record<string, any> | null
      const lock = await acquireDeliveryLock(newsletter.id, meta)
      if (!lock) continue

      let lockReleased = false

      try {
        const config = await getEmailConfig(newsletter.siteId)
        if (!config?.apiKey || !config?.fromEmail) continue
        if (!newsletter.content?.trim()) continue

        const dripConfig = meta?.drip_config
        const isDrip = dripConfig?.enabled === true

        // For drip mode, skip if next_batch_at is in the future
        if (isDrip && dripConfig.next_batch_at) {
          if (new Date(dripConfig.next_batch_at) > new Date()) continue
        }

        // For drip mode, skip if current time is outside the send window
        if (isDrip && dripConfig.send_window_start && dripConfig.send_window_end) {
          const tz = dripConfig.send_window_timezone || 'America/New_York'
          const nowInTz = new Date().toLocaleString('en-US', { timeZone: tz })
          const currentMinutes = new Date(nowInTz).getHours() * 60 + new Date(nowInTz).getMinutes()
          const [startH, startM] = dripConfig.send_window_start.split(':').map(Number)
          const [endH, endM] = dripConfig.send_window_end.split(':').map(Number)
          const windowStart = startH * 60 + startM
          const windowEnd = endH * 60 + endM
          if (currentMinutes < windowStart || currentMinutes >= windowEnd) continue
        }

        // Get contacts that have already been sent to
        const sentEvents = await db
          .select({ contactId: newsletterEvents.contactId })
          .from(newsletterEvents)
          .where(and(eq(newsletterEvents.sourceId, newsletter.id), eq(newsletterEvents.eventType, 'sent')))

        const sentContactIds = new Set(sentEvents.map(e => e.contactId))

        // Get matching active contacts
        const audienceFilter = newsletter.audienceFilter as Record<string, any> | null
        const filter = audienceFilter || {}

        let allContacts: { id: string; email: string; metadata: any }[]

        if (filter.segment_id) {
          allContacts = await db
            .select({ id: newsletterContacts.id, email: newsletterContacts.email, metadata: newsletterContacts.metadata })
            .from(newsletterContacts)
            .innerJoin(newsletterSegmentContacts, eq(newsletterSegmentContacts.contactId, newsletterContacts.id))
            .where(and(
              eq(newsletterSegmentContacts.segmentId, filter.segment_id),
              eq(newsletterContacts.siteId, newsletter.siteId),
              eq(newsletterContacts.status, 'active'),
            ))
        } else {
          // Base query: active contacts for this site
          let conditions = and(
            eq(newsletterContacts.siteId, newsletter.siteId),
            eq(newsletterContacts.status, 'active'),
          )

          if (filter.tags?.length) {
            for (const tag of filter.tags) {
              conditions = and(
                conditions,
                sql`${newsletterContacts.metadata} @> ${JSON.stringify({ tags: [tag] })}::jsonb`,
              )
            }
          }

          if (filter.sources?.length) {
            conditions = and(
              conditions,
              inArray(sql`${newsletterContacts.metadata}->>'source'`, filter.sources),
            )
          }

          allContacts = await db
            .select({ id: newsletterContacts.id, email: newsletterContacts.email, metadata: newsletterContacts.metadata })
            .from(newsletterContacts)
            .where(conditions!)
        }

        if (!allContacts.length) {
          const preservedTotalRecipients = Math.max(newsletter.totalRecipients ?? 0, sentContactIds.size)
          await db
            .update(newsletters)
            .set({
              status: 'sent',
              sentAt: now,
              totalRecipients: preservedTotalRecipients,
              totalSent: sentContactIds.size,
              metadata: clearDeliveryLock(meta),
            })
            .where(eq(newsletters.id, newsletter.id))
          lockReleased = true
          totalProcessed++
          continue
        }

        // Filter out already-sent contacts
        const unsent = allContacts.filter(c => !sentContactIds.has(c.id))
        const preservedTotalRecipients = Math.max(
          newsletter.totalRecipients ?? 0,
          allContacts.length,
          sentContactIds.size,
        )

        if (unsent.length === 0) {
          await db
            .update(newsletters)
            .set({
              status: 'sent',
              sentAt: new Date(),
              totalRecipients: preservedTotalRecipients,
              totalSent: sentContactIds.size,
              metadata: clearDeliveryLock(meta),
            })
            .where(eq(newsletters.id, newsletter.id))
          lockReleased = true
          totalProcessed++
          continue
        }

        // Determine batch size
        const batchSize = isDrip
          ? Math.floor(Math.random() * ((dripConfig.batch_size_max || 500) - (dripConfig.batch_size_min || 400) + 1)) + (dripConfig.batch_size_min || 400)
          : BATCH_SIZE

        const batch = unsent.slice(0, batchSize)
        const provider = getEmailProvider(config.apiKey, config.providerType)
        const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail
        const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

        let batchSent = 0
        let pausedDuringBatch = false

        for (const contact of batch) {
          try {
            if (await isNewsletterPaused(newsletter.id)) {
              pausedDuringBatch = true
              break
            }

            const unsubToken = generateUnsubscribeToken(newsletter.siteId, contact.email)
            const unsubUrl = `${baseUrl}/unsubscribe?site=${newsletter.siteId}&email=${encodeURIComponent(contact.email)}&token=${unsubToken}&newsletter=${newsletter.id}`

            // Replace {{unsubscribe_url}} placeholder from footer block
            let htmlWithUnsub = newsletter.content!.replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)

            // Only append unsubscribe if content doesn't already have one
            if (!htmlWithUnsub.includes('/unsubscribe?')) {
              const unsubHtml = `
                <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;">
                  <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
                </div>`
              if (htmlWithUnsub.includes('</body>')) {
                htmlWithUnsub = htmlWithUnsub.replace('</body>', unsubHtml + '</body>')
              } else {
                htmlWithUnsub = htmlWithUnsub + unsubHtml
              }
            }

            const result = await provider.send({
              from,
              to: contact.email,
              subject: newsletter.subject || newsletter.name,
              html: htmlWithUnsub,
              headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            })

            if (result.success && result.messageId) {
              batchSent++
              await db.insert(newsletterEvents).values({
                siteId: newsletter.siteId,
                contactId: contact.id,
                eventType: 'sent',
                sourceType: 'broadcast',
                sourceId: newsletter.id,
                providerMessageId: result.messageId,
              })
            }
          } catch {
            // Skip failed contact, will retry next cron tick
          }
        }

        const newTotalSent = sentContactIds.size + batchSent
        const updatedTotalRecipients = Math.max(preservedTotalRecipients, newTotalSent)
        const remainingUnsentCount = unsent.length - batchSent
        const allDone = remainingUnsentCount === 0
        if (!pausedDuringBatch && await isNewsletterPaused(newsletter.id)) {
          pausedDuringBatch = true
        }

        if (pausedDuringBatch) {
          await db
            .update(newsletters)
            .set({
              totalRecipients: updatedTotalRecipients,
              totalSent: newTotalSent,
              metadata: sql`coalesce(${newsletters.metadata}, '{}'::jsonb) - 'delivery_lock_token' - 'delivery_lock_started_at'`,
            })
            .where(eq(newsletters.id, newsletter.id))
          lockReleased = true
        } else if (isDrip && !allDone) {
          // Bounce check
          const [bounceResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(newsletterEvents)
            .where(and(eq(newsletterEvents.sourceId, newsletter.id), eq(newsletterEvents.eventType, 'bounced')))

          const totalBounced = bounceResult?.count || 0
          const bounceRate = newTotalSent > 0 ? (totalBounced / newTotalSent) * 100 : 0
          const threshold = dripConfig.bounce_threshold_percent || 5

          if (bounceRate >= threshold) {
            // Auto-pause due to bounce threshold
            await db
              .update(newsletters)
              .set({
                status: 'paused',
                totalRecipients: updatedTotalRecipients,
                totalSent: newTotalSent,
                metadata: clearDeliveryLock({
                  ...meta,
                  drip_config: {
                    ...dripConfig,
                    batches_sent: (dripConfig.batches_sent || 0) + 1,
                    total_bounced: totalBounced,
                    paused_reason: `Bounce rate ${bounceRate.toFixed(1)}% exceeded ${threshold}% threshold`,
                  },
                }),
              })
              .where(eq(newsletters.id, newsletter.id))
            lockReleased = true

            // Send admin email notification
            await sendBounceAlertEmail(newsletter, config, provider, bounceRate, threshold, totalBounced, newTotalSent)
          } else {
            // Schedule next batch
            const intervalMin = dripConfig.interval_min_minutes || 30
            const intervalMax = dripConfig.interval_max_minutes || 60
            const nextIntervalMs = (Math.floor(Math.random() * (intervalMax - intervalMin + 1)) + intervalMin) * 60 * 1000
            const nextBatchAt = new Date(Date.now() + nextIntervalMs).toISOString()

            await db
              .update(newsletters)
              .set({
                totalRecipients: updatedTotalRecipients,
                totalSent: newTotalSent,
                metadata: clearDeliveryLock({
                  ...meta,
                  drip_config: {
                    ...dripConfig,
                    next_batch_at: nextBatchAt,
                    batches_sent: (dripConfig.batches_sent || 0) + 1,
                    total_bounced: totalBounced,
                    paused_reason: null,
                  },
                }),
              })
              .where(eq(newsletters.id, newsletter.id))
            lockReleased = true
          }
        } else {
          // Non-drip or all done
          await db
            .update(newsletters)
            .set({
              ...(allDone ? { status: 'sent', sentAt: new Date() } : {}),
              totalRecipients: updatedTotalRecipients,
              totalSent: newTotalSent,
              metadata: clearDeliveryLock(meta),
            })
            .where(eq(newsletters.id, newsletter.id))
          lockReleased = true
        }

        totalProcessed += batchSent
      } catch {
        // Skip failed newsletter, will retry next cron tick
      } finally {
        if (!lockReleased) {
          await releaseDeliveryLock(newsletter.id, lock.token)
        }
      }
    }

    return NextResponse.json({ message: `Sent ${totalProcessed} emails`, processed: totalProcessed })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function sendBounceAlertEmail(
  newsletter: any,
  config: any,
  provider: EmailProvider,
  bounceRate: number,
  threshold: number,
  totalBounced: number,
  totalSent: number,
) {
  try {
    // Look up site owner email
    const [site] = await db
      .select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, newsletter.siteId))

    if (!site?.userId) return

    const [user] = await db
      .select({ email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, site.userId))

    const adminEmail = user?.email
    if (!adminEmail) return

    const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail

    await provider.send({
      from,
      to: adminEmail,
      subject: `Newsletter Paused — Bounce rate ${bounceRate.toFixed(1)}% exceeded ${threshold}% threshold`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#dc2626;">Newsletter Auto-Paused</h2>
          <p>Your newsletter "<strong>${newsletter.name}</strong>" has been automatically paused because the bounce rate exceeded your configured threshold.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Bounce Rate</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${bounceRate.toFixed(1)}%</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Threshold</td><td style="padding:8px;border-bottom:1px solid #eee;">${threshold}%</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Total Bounced</td><td style="padding:8px;border-bottom:1px solid #eee;">${totalBounced}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Total Sent</td><td style="padding:8px;border-bottom:1px solid #eee;">${totalSent}</td></tr>
          </table>
          <p>You can review your bounce events and resume sending from the newsletter dashboard.</p>
        </div>
      `,
    })
  } catch {
    // Bounce alert is best-effort
  }
}
