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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Get active enrollments — batch of 50 to avoid timeouts
    const { data: enrollments, error: enrollError } = await supabaseAdmin
      .from('email_automation_enrollments')
      .select('*, email_automations!inner(site_id, status)')
      .eq('status', 'active')
      .eq('email_automations.status', 'active')
      .limit(50)

    if (enrollError) {
      console.error('Cron automations error:', enrollError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!enrollments?.length) {
      return NextResponse.json({ message: 'No active enrollments', processed: 0 })
    }

    let processed = 0

    for (const enrollment of enrollments) {
      try {
        const siteId = (enrollment as any).email_automations.site_id
        const nextStepOrder = enrollment.current_step_order + 1

        // Get next step
        const { data: step } = await supabaseAdmin
          .from('email_automation_steps')
          .select('*')
          .eq('automation_id', enrollment.automation_id)
          .eq('step_order', nextStepOrder)
          .single()

        if (!step) {
          // No more steps — mark completed
          await supabaseAdmin
            .from('email_automation_enrollments')
            .update({ status: 'completed', completed_at: now.toISOString() })
            .eq('id', enrollment.id)
          processed++
          continue
        }

        // Check if delay has passed
        const referenceTime = enrollment.last_step_sent_at || enrollment.enrolled_at
        const dueAt = new Date(new Date(referenceTime).getTime() + step.delay_minutes * 60 * 1000)
        if (now < dueAt) continue

        // Get contact
        const { data: contact } = await supabaseAdmin
          .from('newsletter_contacts')
          .select('id, email, status')
          .eq('id', enrollment.contact_id)
          .single()

        if (!contact || contact.status !== 'active') {
          await supabaseAdmin
            .from('email_automation_enrollments')
            .update({ status: 'cancelled' })
            .eq('id', enrollment.id)
          continue
        }

        // Get Resend config
        const config = await getResendConfig(siteId)
        if (!config?.apiKey || !config?.fromEmail) continue

        const resend = new Resend(config.apiKey)
        const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail
        const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

        const unsubToken = generateUnsubscribeToken(siteId, contact.email)
        const unsubUrl = `${baseUrl}/unsubscribe?site=${siteId}&email=${encodeURIComponent(contact.email)}&token=${unsubToken}`

        const html = (step.content || '') + `
          <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;">
            <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
          </div>`

        const result = await resend.emails.send({
          from,
          to: contact.email,
          subject: step.subject,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })

        if (result.data?.id) {
          // Update enrollment
          await supabaseAdmin
            .from('email_automation_enrollments')
            .update({
              current_step_order: nextStepOrder,
              last_step_sent_at: now.toISOString(),
            })
            .eq('id', enrollment.id)

          // Record event
          await supabaseAdmin.from('newsletter_events').insert({
            site_id: siteId,
            contact_id: contact.id,
            event_type: 'sent',
            source_type: 'automation',
            source_id: enrollment.automation_id,
            resend_message_id: result.data.id,
            metadata: { step_order: nextStepOrder },
          })

          processed++
        }
      } catch (err) {
        console.error(`Failed to process enrollment ${enrollment.id}:`, err)
      }
    }

    return NextResponse.json({ message: `Processed ${processed} steps`, processed })
  } catch (err) {
    console.error('Cron email-automations error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
