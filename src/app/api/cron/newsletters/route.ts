import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newsletters, newsletterContacts, newsletterEvents, sites, users } from '@/lib/db/schema'
import { eq, and, lte, inArray, sql } from 'drizzle-orm'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { Resend } from 'resend'

const BATCH_SIZE = 50

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
      try {
        const config = await getResendConfig(newsletter.siteId)
        if (!config?.apiKey || !config?.fromEmail) continue
        if (!newsletter.content?.trim()) continue

        const meta = newsletter.metadata as Record<string, any> | null
        const dripConfig = meta?.drip_config
        const isDrip = dripConfig?.enabled === true

        // For drip mode, skip if next_batch_at is in the future
        if (isDrip && dripConfig.next_batch_at) {
          if (new Date(dripConfig.next_batch_at) > new Date()) continue
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

        // Base query: active contacts for this site
        // Note: advanced tag/source filtering via jsonb is handled in SQL
        let conditions = and(
          eq(newsletterContacts.siteId, newsletter.siteId),
          eq(newsletterContacts.status, 'active'),
        )

        // Add tag filter if present
        if (filter.tags?.length) {
          for (const tag of filter.tags) {
            conditions = and(
              conditions,
              sql`${newsletterContacts.metadata} @> ${JSON.stringify({ tags: [tag] })}::jsonb`,
            )
          }
        }

        // Add source filter if present
        if (filter.sources?.length) {
          conditions = and(
            conditions,
            inArray(sql`${newsletterContacts.metadata}->>'source'`, filter.sources),
          )
        }

        const allContacts = await db
          .select({ id: newsletterContacts.id, email: newsletterContacts.email, metadata: newsletterContacts.metadata })
          .from(newsletterContacts)
          .where(conditions!)

        if (!allContacts.length) {
          await db
            .update(newsletters)
            .set({ status: 'sent', sentAt: now, totalRecipients: 0, totalSent: 0 })
            .where(eq(newsletters.id, newsletter.id))
          totalProcessed++
          continue
        }

        // Filter out already-sent contacts
        const unsent = allContacts.filter(c => !sentContactIds.has(c.id))

        if (unsent.length === 0) {
          await db
            .update(newsletters)
            .set({
              status: 'sent',
              sentAt: new Date(),
              totalRecipients: allContacts.length,
              totalSent: sentContactIds.size,
            })
            .where(eq(newsletters.id, newsletter.id))
          totalProcessed++
          continue
        }

        // Determine batch size
        const batchSize = isDrip
          ? Math.floor(Math.random() * ((dripConfig.batch_size_max || 500) - (dripConfig.batch_size_min || 400) + 1)) + (dripConfig.batch_size_min || 400)
          : BATCH_SIZE

        const batch = unsent.slice(0, batchSize)
        const resend = new Resend(config.apiKey)
        const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail
        const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

        let batchSent = 0

        for (const contact of batch) {
          try {
            const unsubToken = generateUnsubscribeToken(newsletter.siteId, contact.email)
            const unsubUrl = `${baseUrl}/unsubscribe?site=${newsletter.siteId}&email=${encodeURIComponent(contact.email)}&token=${unsubToken}`

            const htmlWithUnsub = newsletter.content + `
              <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;">
                <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
              </div>`

            const result = await resend.emails.send({
              from,
              to: contact.email,
              subject: newsletter.subject || newsletter.name,
              html: htmlWithUnsub,
              headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            })

            if (result.data?.id) {
              batchSent++
              await db.insert(newsletterEvents).values({
                siteId: newsletter.siteId,
                contactId: contact.id,
                eventType: 'sent',
                sourceType: 'broadcast',
                sourceId: newsletter.id,
                resendMessageId: result.data.id,
              })
            }
          } catch (err) {
            console.error(`Failed to send to ${contact.email}:`, err)
          }
        }

        const newTotalSent = sentContactIds.size + batchSent
        const allDone = unsent.length <= batchSize

        if (isDrip && !allDone) {
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
                totalRecipients: allContacts.length,
                totalSent: newTotalSent,
                metadata: {
                  ...meta,
                  drip_config: {
                    ...dripConfig,
                    batches_sent: (dripConfig.batches_sent || 0) + 1,
                    total_bounced: totalBounced,
                    paused_reason: `Bounce rate ${bounceRate.toFixed(1)}% exceeded ${threshold}% threshold`,
                  },
                },
              })
              .where(eq(newsletters.id, newsletter.id))

            // Send admin email notification
            await sendBounceAlertEmail(newsletter, config, resend, bounceRate, threshold, totalBounced, newTotalSent)
          } else {
            // Schedule next batch
            const intervalMin = dripConfig.interval_min_minutes || 30
            const intervalMax = dripConfig.interval_max_minutes || 60
            const nextIntervalMs = (Math.floor(Math.random() * (intervalMax - intervalMin + 1)) + intervalMin) * 60 * 1000
            const nextBatchAt = new Date(Date.now() + nextIntervalMs).toISOString()

            await db
              .update(newsletters)
              .set({
                totalRecipients: allContacts.length,
                totalSent: newTotalSent,
                metadata: {
                  ...meta,
                  drip_config: {
                    ...dripConfig,
                    next_batch_at: nextBatchAt,
                    batches_sent: (dripConfig.batches_sent || 0) + 1,
                    total_bounced: totalBounced,
                    paused_reason: null,
                  },
                },
              })
              .where(eq(newsletters.id, newsletter.id))
          }
        } else {
          // Non-drip or all done
          await db
            .update(newsletters)
            .set({
              ...(allDone ? { status: 'sent', sentAt: new Date() } : {}),
              totalRecipients: allContacts.length,
              totalSent: newTotalSent,
            })
            .where(eq(newsletters.id, newsletter.id))
        }

        totalProcessed += batchSent
      } catch (err) {
        console.error(`Failed to process newsletter ${newsletter.id}:`, err)
      }
    }

    return NextResponse.json({ message: `Sent ${totalProcessed} emails`, processed: totalProcessed })
  } catch (err) {
    console.error('Cron newsletters error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function sendBounceAlertEmail(
  newsletter: any,
  config: any,
  resend: Resend,
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
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, site.userId))

    const adminEmail = user?.email
    if (!adminEmail) return

    const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail

    await resend.emails.send({
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
  } catch (err) {
    console.error('Failed to send bounce alert email:', err)
  }
}
