import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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
    const now = new Date().toISOString()

    // Move scheduled newsletters to sending
    await supabaseAdmin
      .from('newsletters')
      .update({ status: 'sending' })
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)

    // Get newsletters that are currently sending
    const { data: newsletters, error } = await supabaseAdmin
      .from('newsletters')
      .select('*')
      .eq('status', 'sending')

    if (error) {
      console.error('Cron newsletters query error:', error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!newsletters?.length) {
      return NextResponse.json({ message: 'No newsletters to process', processed: 0 })
    }

    let totalProcessed = 0

    for (const newsletter of newsletters) {
      try {
        const config = await getResendConfig(newsletter.site_id)
        if (!config?.apiKey || !config?.fromEmail) continue
        if (!newsletter.content?.trim()) continue

        const dripConfig = newsletter.metadata?.drip_config
        const isDrip = dripConfig?.enabled === true

        // For drip mode, skip if next_batch_at is in the future
        if (isDrip && dripConfig.next_batch_at) {
          if (new Date(dripConfig.next_batch_at) > new Date()) continue
        }

        // Get contacts that haven't been sent to yet (no 'sent' event for this newsletter)
        const { data: sentEvents } = await supabaseAdmin
          .from('newsletter_events')
          .select('contact_id')
          .eq('source_id', newsletter.id)
          .eq('event_type', 'sent')

        const sentContactIds = new Set((sentEvents || []).map((e: any) => e.contact_id))

        // Get matching active contacts
        let query = supabaseAdmin
          .from('newsletter_contacts')
          .select('id, email, metadata')
          .eq('site_id', newsletter.site_id)
          .eq('status', 'active')

        const filter = newsletter.audience_filter || {}
        if (filter.tags?.length) {
          for (const tag of filter.tags) {
            query = query.contains('metadata', { tags: [tag] })
          }
        }
        if (filter.sources?.length) {
          query = query.in('metadata->>source', filter.sources)
        }

        const { data: allContacts } = await query

        if (!allContacts?.length) {
          await supabaseAdmin
            .from('newsletters')
            .update({ status: 'sent', sent_at: now, total_recipients: 0, total_sent: 0 })
            .eq('id', newsletter.id)
          totalProcessed++
          continue
        }

        // Filter out already-sent contacts
        const unsent = allContacts.filter((c: any) => !sentContactIds.has(c.id))

        if (unsent.length === 0) {
          await supabaseAdmin
            .from('newsletters')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              total_recipients: allContacts.length,
              total_sent: sentContactIds.size,
            })
            .eq('id', newsletter.id)
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
            const unsubToken = generateUnsubscribeToken(newsletter.site_id, contact.email)
            const unsubUrl = `${baseUrl}/unsubscribe?site=${newsletter.site_id}&email=${encodeURIComponent(contact.email)}&token=${unsubToken}`

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
              await supabaseAdmin.from('newsletter_events').insert({
                site_id: newsletter.site_id,
                contact_id: contact.id,
                event_type: 'sent',
                source_type: 'broadcast',
                source_id: newsletter.id,
                resend_message_id: result.data.id,
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
          const { count: bounceCount } = await supabaseAdmin
            .from('newsletter_events')
            .select('id', { count: 'exact', head: true })
            .eq('source_id', newsletter.id)
            .eq('event_type', 'bounced')

          const totalBounced = bounceCount || 0
          const bounceRate = newTotalSent > 0 ? (totalBounced / newTotalSent) * 100 : 0
          const threshold = dripConfig.bounce_threshold_percent || 5

          if (bounceRate >= threshold) {
            // Auto-pause due to bounce threshold
            await supabaseAdmin
              .from('newsletters')
              .update({
                status: 'paused',
                total_recipients: allContacts.length,
                total_sent: newTotalSent,
                metadata: {
                  ...newsletter.metadata,
                  drip_config: {
                    ...dripConfig,
                    batches_sent: (dripConfig.batches_sent || 0) + 1,
                    total_bounced: totalBounced,
                    paused_reason: `Bounce rate ${bounceRate.toFixed(1)}% exceeded ${threshold}% threshold`,
                  },
                },
              })
              .eq('id', newsletter.id)

            // Send admin email notification
            await sendBounceAlertEmail(newsletter, config, resend, bounceRate, threshold, totalBounced, newTotalSent)
          } else {
            // Schedule next batch
            const intervalMin = dripConfig.interval_min_minutes || 30
            const intervalMax = dripConfig.interval_max_minutes || 60
            const nextIntervalMs = (Math.floor(Math.random() * (intervalMax - intervalMin + 1)) + intervalMin) * 60 * 1000
            const nextBatchAt = new Date(Date.now() + nextIntervalMs).toISOString()

            await supabaseAdmin
              .from('newsletters')
              .update({
                total_recipients: allContacts.length,
                total_sent: newTotalSent,
                metadata: {
                  ...newsletter.metadata,
                  drip_config: {
                    ...dripConfig,
                    next_batch_at: nextBatchAt,
                    batches_sent: (dripConfig.batches_sent || 0) + 1,
                    total_bounced: totalBounced,
                    paused_reason: null,
                  },
                },
              })
              .eq('id', newsletter.id)
          }
        } else {
          // Non-drip or all done
          await supabaseAdmin
            .from('newsletters')
            .update({
              ...(allDone ? { status: 'sent', sent_at: new Date().toISOString() } : {}),
              total_recipients: allContacts.length,
              total_sent: newTotalSent,
            })
            .eq('id', newsletter.id)
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
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('user_id')
      .eq('id', newsletter.site_id)
      .single()

    if (!site?.user_id) return

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(site.user_id)
    const adminEmail = userData?.user?.email
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
