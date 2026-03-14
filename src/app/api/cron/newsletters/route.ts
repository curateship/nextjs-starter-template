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

/**
 * GET /api/cron/newsletters
 * Process scheduled newsletters that are due.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find scheduled newsletters that are due
    const now = new Date().toISOString()
    const { data: newsletters, error } = await supabaseAdmin
      .from('newsletters')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)

    if (error) {
      console.error('Cron newsletters query error:', error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!newsletters?.length) {
      return NextResponse.json({ message: 'No newsletters due', processed: 0 })
    }

    let processed = 0

    for (const newsletter of newsletters) {
      try {
        const config = await getResendConfig(newsletter.site_id)
        if (!config?.apiKey || !config?.fromEmail) {
          console.error(`Resend not configured for site ${newsletter.site_id}`)
          continue
        }

        if (!newsletter.content?.trim()) {
          console.error(`Broadcast ${newsletter.id} has no content`)
          continue
        }

        // Mark as sending
        await supabaseAdmin
          .from('newsletters')
          .update({ status: 'sending' })
          .eq('id', newsletter.id)

        // Get matching contacts
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

        const { data: contacts } = await query

        if (!contacts?.length) {
          await supabaseAdmin
            .from('newsletters')
            .update({ status: 'sent', sent_at: now, total_recipients: 0, total_sent: 0 })
            .eq('id', newsletter.id)
          processed++
          continue
        }

        const resend = new Resend(config.apiKey)
        const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail
        const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

        let totalSent = 0
        const errors: string[] = []

        for (const contact of contacts) {
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
              totalSent++
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
            errors.push(contact.email)
          }
        }

        await supabaseAdmin
          .from('newsletters')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            total_recipients: contacts.length,
            total_sent: totalSent,
            metadata: { ...newsletter.metadata, send_errors: errors },
          })
          .eq('id', newsletter.id)

        processed++
      } catch (err) {
        console.error(`Failed to process newsletter ${newsletter.id}:`, err)
      }
    }

    return NextResponse.json({ message: `Processed ${processed} newsletters`, processed })
  } catch (err) {
    console.error('Cron newsletters error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
