import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailAutomations, emailAutomationSteps, emailAutomationEnrollments, newsletterContacts, newsletterEvents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getResendConfig } from '@/lib/actions/integrations/config-helpers'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { Resend } from 'resend'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Get active enrollments with their automation's site_id and status — batch of 50
    const enrollments = await db
      .select({
        id: emailAutomationEnrollments.id,
        automationId: emailAutomationEnrollments.automationId,
        contactId: emailAutomationEnrollments.contactId,
        currentStepOrder: emailAutomationEnrollments.currentStepOrder,
        status: emailAutomationEnrollments.status,
        enrolledAt: emailAutomationEnrollments.enrolledAt,
        lastStepSentAt: emailAutomationEnrollments.lastStepSentAt,
        automationSiteId: emailAutomations.siteId,
      })
      .from(emailAutomationEnrollments)
      .innerJoin(emailAutomations, eq(emailAutomationEnrollments.automationId, emailAutomations.id))
      .where(and(
        eq(emailAutomationEnrollments.status, 'active'),
        eq(emailAutomations.status, 'active'),
      ))
      .limit(50)

    if (!enrollments.length) {
      return NextResponse.json({ message: 'No active enrollments', processed: 0 })
    }

    let processed = 0

    for (const enrollment of enrollments) {
      try {
        const siteId = enrollment.automationSiteId
        const nextStepOrder = (enrollment.currentStepOrder ?? 0) + 1

        // Get next step
        const [step] = await db
          .select()
          .from(emailAutomationSteps)
          .where(and(
            eq(emailAutomationSteps.automationId, enrollment.automationId),
            eq(emailAutomationSteps.stepOrder, nextStepOrder),
          ))

        if (!step) {
          // No more steps — mark completed
          await db
            .update(emailAutomationEnrollments)
            .set({ status: 'completed', completedAt: now })
            .where(eq(emailAutomationEnrollments.id, enrollment.id))
          processed++
          continue
        }

        if (!step.subject?.trim()) {
          // Skip steps with no subject — can't send without one
          continue
        }

        // Check if delay has passed
        const referenceTime = enrollment.lastStepSentAt || enrollment.enrolledAt
        const dueAt = new Date(new Date(referenceTime).getTime() + step.delayMinutes * 60 * 1000)
        if (now < dueAt) continue

        // Get contact
        const [contact] = await db
          .select({ id: newsletterContacts.id, email: newsletterContacts.email, status: newsletterContacts.status })
          .from(newsletterContacts)
          .where(eq(newsletterContacts.id, enrollment.contactId))

        if (!contact || contact.status !== 'active') {
          await db
            .update(emailAutomationEnrollments)
            .set({ status: 'cancelled' })
            .where(eq(emailAutomationEnrollments.id, enrollment.id))
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

        const unsubHtml = `
          <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;">
            <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
          </div>`

        let html = step.content || ''
        if (html.includes('</body>')) {
          html = html.replace('</body>', unsubHtml + '</body>')
        } else {
          html = html + unsubHtml
        }

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
          await db
            .update(emailAutomationEnrollments)
            .set({
              currentStepOrder: nextStepOrder,
              lastStepSentAt: now,
            })
            .where(eq(emailAutomationEnrollments.id, enrollment.id))

          // Record event
          await db.insert(newsletterEvents).values({
            siteId,
            contactId: contact.id,
            eventType: 'sent',
            sourceType: 'automation',
            sourceId: enrollment.automationId,
            resendMessageId: result.data.id,
            metadata: { step_order: nextStepOrder },
          })

          processed++
        }
      } catch {
        // Skip failed enrollment, will retry next cron tick
      }
    }

    return NextResponse.json({ message: `Processed ${processed} steps`, processed })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
