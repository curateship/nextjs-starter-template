import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailAutomations, emailAutomationSteps, emailAutomationEnrollments, newsletterContacts, productOrders } from '@/lib/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { getEmailProvider } from '@/lib/actions/email/provider'
import { isWithinNewsletterSendWindow } from '@/lib/actions/newsletters/send-windows'
import { recordNewsletterDeliverySent } from '@/lib/actions/newsletters/event-stats'

const NON_DRIP_BATCH_SIZE = 50
const ENROLLMENT_SCAN_LIMIT = 500

type AutomationStepRow = typeof emailAutomationSteps.$inferSelect
type EmailConfig = Awaited<ReturnType<typeof getEmailConfig>>

type DripState = {
  stepId: string
  nodeConfig: Record<string, any>
  dripConfig: Record<string, any>
  limit: number
  sent: number
  reachedLimit: boolean
}

function getNodeConfig(step: { nodeConfig: unknown }) {
  if (!step.nodeConfig || typeof step.nodeConfig !== 'object' || Array.isArray(step.nodeConfig)) return {}
  return step.nodeConfig as Record<string, any>
}

function getDripConfig(nodeConfig: Record<string, any>) {
  const dripConfig = nodeConfig.drip_config
  if (!dripConfig || typeof dripConfig !== 'object' || Array.isArray(dripConfig)) return null
  return dripConfig as Record<string, any>
}

function getEndRuleProductIds(nodeConfig: Record<string, any>) {
  return Array.isArray(nodeConfig.product_ids)
    ? nodeConfig.product_ids.filter((id): id is string => typeof id === 'string')
    : []
}

function getPositiveRuleValue(value: unknown, fallback = 1) {
  return Math.max(1, Math.floor(Number(value) || fallback))
}

function getRandomBetween(minValue: unknown, maxValue: unknown, fallbackMin: number, fallbackMax: number) {
  const min = Math.max(1, Math.floor(Number(minValue) || fallbackMin))
  const max = Math.max(min, Math.floor(Number(maxValue) || fallbackMax))
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function isFutureDate(value: unknown, now: Date) {
  if (typeof value !== 'string') return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp > now.getTime()
}

function getNextBatchAt(dripConfig: Record<string, any>) {
  const intervalMinutes = getRandomBetween(
    dripConfig.interval_min_minutes,
    dripConfig.interval_max_minutes,
    30,
    60,
  )
  return new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString()
}

async function saveDripState(state: DripState, now: Date) {
  if (state.sent === 0) return

  const nextDripConfig: Record<string, any> = {
    ...state.dripConfig,
    last_batch_at: now.toISOString(),
    batches_sent: (Number(state.dripConfig.batches_sent) || 0) + 1,
    paused_reason: null,
  }

  if (state.reachedLimit) {
    nextDripConfig.next_batch_at = getNextBatchAt(state.dripConfig)
  } else {
    delete nextDripConfig.next_batch_at
  }

  await db
    .update(emailAutomationSteps)
    .set({
      nodeConfig: {
        ...state.nodeConfig,
        drip_config: nextDripConfig,
      },
      updatedAt: now,
    })
    .where(eq(emailAutomationSteps.id, state.stepId))
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Scan active enrollments; non-drip sends are still capped below.
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
      .limit(ENROLLMENT_SCAN_LIMIT)

    if (!enrollments.length) {
      return NextResponse.json({ message: 'No active enrollments', processed: 0 })
    }

    let processed = 0
    let nonDripSent = 0
    const stepCache = new Map<string, AutomationStepRow | null>()
    const emailConfigCache = new Map<string, EmailConfig>()
    const dripStates = new Map<string, DripState>()

    for (const enrollment of enrollments) {
      try {
        const siteId = enrollment.automationSiteId
        const nextStepOrder = (enrollment.currentStepOrder ?? 0) + 1
        const stepCacheKey = `${enrollment.automationId}:${nextStepOrder}`

        let step = stepCache.get(stepCacheKey)
        if (!stepCache.has(stepCacheKey)) {
          const [loadedStep] = await db
            .select()
            .from(emailAutomationSteps)
            .where(and(
              eq(emailAutomationSteps.automationId, enrollment.automationId),
              eq(emailAutomationSteps.stepOrder, nextStepOrder),
            ))
          step = loadedStep ?? null
          stepCache.set(stepCacheKey, step)
        }

        if (!step) {
          // No more steps — mark completed
          await db
            .update(emailAutomationEnrollments)
            .set({ status: 'completed', completedAt: now })
            .where(eq(emailAutomationEnrollments.id, enrollment.id))
          processed++
          continue
        }

        // Check if delay has passed
        const referenceTime = enrollment.lastStepSentAt || enrollment.enrolledAt
        const dueAt = new Date(new Date(referenceTime).getTime() + step.delayMinutes * 60 * 1000)
        if (now < dueAt) continue

        if (step.nodeType === 'delay') {
          await db
            .update(emailAutomationEnrollments)
            .set({
              currentStepOrder: nextStepOrder,
              lastStepSentAt: now,
            })
            .where(eq(emailAutomationEnrollments.id, enrollment.id))
          processed++
          continue
        }

        if (step.nodeType === 'end_rules') {
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

          const nodeConfig = getNodeConfig(step)
          const productIds = getEndRuleProductIds(nodeConfig)
          const purchaseRows = productIds.length
            ? await db
              .select({ id: productOrders.id })
              .from(productOrders)
              .where(and(
                eq(productOrders.siteId, siteId),
                inArray(productOrders.productId, productIds),
                eq(productOrders.customerEmail, contact.email.toLowerCase()),
                eq(productOrders.orderType, 'paid_purchase'),
                eq(productOrders.paymentStatus, 'succeeded'),
              ))
              .limit(1)
            : []

          if (purchaseRows.length) {
            await db
              .update(emailAutomationEnrollments)
              .set({
                status: 'goal_met',
                currentStepOrder: nextStepOrder,
                goalMetAt: now,
                lastStepSentAt: now,
              })
              .where(eq(emailAutomationEnrollments.id, enrollment.id))
            processed++
            continue
          }

          const engagementRows = await db.execute<{ opened_count: number; clicked_count: number }>(sql`
            select
              count(distinct step_order) filter (where first_opened_at is not null)::int as opened_count,
              count(distinct step_order) filter (where first_clicked_at is not null)::int as clicked_count
            from newsletter_deliveries
            where site_id = ${siteId}
              and contact_id = ${contact.id}
              and source_type = 'automation'
              and source_id = ${enrollment.automationId}
              and step_order < ${nextStepOrder}
          `)
          const openedCount = Number(engagementRows.rows[0]?.opened_count ?? 0)
          const clickedCount = Number(engagementRows.rows[0]?.clicked_count ?? 0)
          const minimumOpens = getPositiveRuleValue(nodeConfig.minimum_opens)
          const minimumClicks = getPositiveRuleValue(nodeConfig.minimum_clicks)

          if (openedCount >= minimumOpens || clickedCount >= minimumClicks) {
            await db
              .update(emailAutomationEnrollments)
              .set({
                currentStepOrder: nextStepOrder,
                lastStepSentAt: now,
              })
              .where(eq(emailAutomationEnrollments.id, enrollment.id))
          } else {
            await db
              .update(emailAutomationEnrollments)
              .set({
                status: 'cancelled',
                currentStepOrder: nextStepOrder,
                lastStepSentAt: now,
              })
              .where(eq(emailAutomationEnrollments.id, enrollment.id))
          }

          processed++
          continue
        }

        if (!step.subject?.trim()) {
          // Skip email steps with no subject — can't send without one
          continue
        }

        const nodeConfig = getNodeConfig(step)
        const dripConfig = getDripConfig(nodeConfig)
        const isDrip = dripConfig?.enabled === true
        let dripState: DripState | null = null

        if (isDrip && dripConfig) {
          if (isFutureDate(dripConfig.next_batch_at, now)) continue
          if (!isWithinNewsletterSendWindow(dripConfig, now)) continue

          dripState = dripStates.get(step.id) || {
            stepId: step.id,
            nodeConfig,
            dripConfig,
            limit: getRandomBetween(dripConfig.batch_size_min, dripConfig.batch_size_max, 400, 500),
            sent: 0,
            reachedLimit: false,
          }
          dripStates.set(step.id, dripState)

          if (dripState.sent >= dripState.limit) {
            dripState.reachedLimit = true
            continue
          }
        } else if (nonDripSent >= NON_DRIP_BATCH_SIZE) {
          continue
        }

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

        let config = emailConfigCache.get(siteId)
        if (!emailConfigCache.has(siteId)) {
          config = await getEmailConfig(siteId)
          emailConfigCache.set(siteId, config)
        }
        if (!config?.apiKey || !config?.fromEmail) continue

        const provider = getEmailProvider(config.apiKey, config.providerType)
        const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail
        const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

        const unsubToken = generateUnsubscribeToken(siteId, contact.email)
        const unsubUrl = `${baseUrl}/unsubscribe?site=${siteId}&email=${encodeURIComponent(contact.email)}&token=${unsubToken}`

        // Replace {{unsubscribe_url}} placeholder from footer block
        let html = (step.content || '').replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)

        // Only append unsubscribe if content doesn't already have one
        if (!html.includes('/unsubscribe?')) {
          const unsubHtml = `
            <div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;">
              <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
            </div>`
          if (html.includes('</body>')) {
            html = html.replace('</body>', unsubHtml + '</body>')
          } else {
            html = html + unsubHtml
          }
        }

        const result = await provider.send({
          from,
          to: contact.email,
          subject: step.subject!,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })

        if (result.success && result.messageId) {
          await recordNewsletterDeliverySent(db, {
            siteId,
            contactId: contact.id,
            sourceType: 'automation',
            sourceId: enrollment.automationId,
            stepOrder: nextStepOrder,
            providerMessageId: result.messageId,
            sentAt: now,
          })

          // Update enrollment
          await db
            .update(emailAutomationEnrollments)
            .set({
              currentStepOrder: nextStepOrder,
              lastStepSentAt: now,
            })
            .where(eq(emailAutomationEnrollments.id, enrollment.id))

          if (dripState) {
            dripState.sent++
            if (dripState.sent >= dripState.limit) dripState.reachedLimit = true
          } else {
            nonDripSent++
          }

          processed++
        }
      } catch {
        // Skip failed enrollment, will retry next cron tick
      }
    }

    for (const state of dripStates.values()) {
      await saveDripState(state, now)
    }

    return NextResponse.json({ message: `Processed ${processed} steps`, processed })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
