import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { siteIntegrations, newsletterEvents, newsletterContacts, newsletters } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { safeDecrypt } from '@/lib/utils/encryption'
import { syncDynamicSegmentsForContacts } from '@/lib/actions/newsletters/segment-actions'

/**
 * POST /api/webhooks/resend
 * Handle Resend webhook events and keep local contact suppression state in sync.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature using Svix HMAC-SHA256
    const svixId = request.headers.get('svix-id')
    const svixTimestamp = request.headers.get('svix-timestamp')
    const svixSignature = request.headers.get('svix-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 })
    }

    // Reject timestamps older than 5 minutes to prevent replay attacks
    const timestamp = parseInt(svixTimestamp)
    const now = Math.floor(Date.now() / 1000)
    if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Invalid timestamp' }, { status: 401 })
    }

    const rawBody = await request.text()

    // Try all Resend integrations to find a matching webhook secret
    const integrations = await db
      .select({ siteId: siteIntegrations.siteId, config: siteIntegrations.config })
      .from(siteIntegrations)
      .where(and(
        eq(siteIntegrations.integrationType, 'resend'),
        eq(siteIntegrations.isEnabled, true),
      ))

    if (!integrations.length) {
      return NextResponse.json({ error: 'No Resend integrations configured' }, { status: 400 })
    }

    let body: Record<string, any> | null = null
    for (const integration of integrations) {
      const config = integration.config as Record<string, any>
      const secret = typeof config?.webhook_secret === 'string'
        ? safeDecrypt(config.webhook_secret)
        : undefined
      if (!secret) continue

      try {
        body = new Resend('re_placeholder').webhooks.verify({
          payload: rawBody,
          headers: {
            id: svixId,
            timestamp: svixTimestamp,
            signature: svixSignature,
          },
          webhookSecret: secret,
        }) as Record<string, any>
        break
      } catch {
        continue
      }
    }

    if (!body) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    const { type, data } = body

    const messageId = data?.email_id || data?.id

    // Map Resend event types to our event types
    const eventTypeMap: Record<string, string> = {
      'email.opened': 'opened',
      'email.clicked': 'clicked',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
      'email.delivered': 'sent',
    }

    const eventType = eventTypeMap[type]

    // Record to newsletter_events if we have a message ID
    if (eventType && messageId) {
      try {
        const [duplicateEvent] = await db
          .select({ id: newsletterEvents.id })
          .from(newsletterEvents)
          .where(and(
            eq(newsletterEvents.providerMessageId, messageId),
            eq(newsletterEvents.eventType, eventType),
          ))
          .limit(1)

        if (duplicateEvent) {
          return NextResponse.json({ message: 'Event already recorded' })
        }

        // Find the event record by provider_message_id to get contact_id and source
        const [existingEvent] = await db
          .select({
            siteId: newsletterEvents.siteId,
            contactId: newsletterEvents.contactId,
            sourceType: newsletterEvents.sourceType,
            sourceId: newsletterEvents.sourceId,
          })
          .from(newsletterEvents)
          .where(eq(newsletterEvents.providerMessageId, messageId))
          .limit(1)

        if (existingEvent) {
          await db.insert(newsletterEvents).values({
            siteId: existingEvent.siteId,
            contactId: existingEvent.contactId,
            eventType,
            sourceType: existingEvent.sourceType,
            sourceId: existingEvent.sourceId,
            providerMessageId: messageId,
            metadata: { link_url: data?.click?.link, bounce_type: data?.bounce?.type },
          })

          // Update contact status on bounces/complaints
          if (eventType === 'bounced' && existingEvent.contactId) {
            await db
              .update(newsletterContacts)
              .set({
                status: 'bounced',
                bounceCount: sql`${newsletterContacts.bounceCount} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(newsletterContacts.id, existingEvent.contactId))
          }

          if (eventType === 'complained' && existingEvent.contactId) {
            await db
              .update(newsletterContacts)
              .set({ status: 'complained', updatedAt: new Date() })
              .where(eq(newsletterContacts.id, existingEvent.contactId))
          }

          // Update newsletter open/click counts
          if (existingEvent.sourceType === 'broadcast' && existingEvent.sourceId) {
            if (eventType === 'opened') {
              await db
                .update(newsletters)
                .set({ totalOpened: sql`${newsletters.totalOpened} + 1` })
                .where(eq(newsletters.id, existingEvent.sourceId))
            } else if (eventType === 'clicked') {
              await db
                .update(newsletters)
                .set({ totalClicked: sql`${newsletters.totalClicked} + 1` })
                .where(eq(newsletters.id, existingEvent.sourceId))
            }
          }

          // Update engagement
          if (existingEvent.contactId && (eventType === 'opened' || eventType === 'clicked')) {
            await db
              .update(newsletterContacts)
              .set({ lastEngagedAt: new Date() })
              .where(eq(newsletterContacts.id, existingEvent.contactId))

            await syncDynamicSegmentsForContacts([existingEvent.contactId])
          }
        }
      } catch (err) {
        console.error('Error recording newsletter event:', err)
      }
    }

    return NextResponse.json({ message: 'Event recorded' })
  } catch (error) {
    console.error('Error in Resend webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
