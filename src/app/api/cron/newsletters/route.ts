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
 * Process scheduled/sending newsletters in batches of 50.
 * - 'scheduled' newsletters with scheduled_at <= now get moved to 'sending'
 * - 'sending' newsletters get the next batch of unsent contacts processed
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

        // Get contacts that haven't been sent to yet (no 'sent' event for this newsletter)
        const { data: sentEvents } = await supabaseAdmin
          .from('newsletter_events')
          .select('contact_id')
          .eq('source_id', newsletter.id)
          .eq('event_type', 'sent')

        const sentContactIds = new Set((sentEvents || []).map(e => e.contact_id))

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
          // No contacts at all — mark as sent
          await supabaseAdmin
            .from('newsletters')
            .update({ status: 'sent', sent_at: now, total_recipients: 0, total_sent: 0 })
            .eq('id', newsletter.id)
          totalProcessed++
          continue
        }

        // Filter out already-sent contacts
        const unsent = allContacts.filter(c => !sentContactIds.has(c.id))

        if (unsent.length === 0) {
          // All contacts sent — mark as complete
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

        // Process this batch
        const batch = unsent.slice(0, BATCH_SIZE)
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

        // Update progress
        const newTotalSent = sentContactIds.size + batchSent
        const allDone = unsent.length <= BATCH_SIZE

        await supabaseAdmin
          .from('newsletters')
          .update({
            ...(allDone ? { status: 'sent', sent_at: new Date().toISOString() } : {}),
            total_recipients: allContacts.length,
            total_sent: newTotalSent,
          })
          .eq('id', newsletter.id)

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
