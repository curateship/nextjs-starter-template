import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { siteIntegrations, newsletterContacts } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { safeDecrypt } from '@/lib/utils/encryption'
import { syncDynamicSegmentsForContacts } from '@/lib/actions/newsletters/segment-actions'
import { recordNewsletterDeliveryEvent } from '@/lib/actions/newsletters/event-stats'

const SVIX_SECRET_PREFIX = `whsec${String.fromCharCode(95)}`

function getSvixSecretBytes(secret: string) {
  if (!secret.startsWith(SVIX_SECRET_PREFIX)) return Buffer.from(secret)
  return Buffer.from(secret.slice(SVIX_SECRET_PREFIX.length), 'base64')
}

function verifySvixSignature(rawBody: string, id: string, timestamp: string, signatureHeader: string, secret: string) {
  const signedPayload = `${id}.${timestamp}.${rawBody}`
  const expected = createHmac('sha256', getSvixSecretBytes(secret))
    .update(signedPayload)
    .digest('base64')
  const expectedBuffer = Buffer.from(expected)

  return signatureHeader
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .some((part) => {
      const actualBuffer = Buffer.from(part.slice(3))
      return actualBuffer.length === expectedBuffer.length
        && timingSafeEqual(actualBuffer, expectedBuffer)
    })
}

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
      .where(eq(siteIntegrations.integrationType, 'resend'))

    if (!integrations.length) {
      return NextResponse.json({ error: 'No Resend integrations configured' }, { status: 400 })
    }

    let body: Record<string, any> | null = null
    let matchedSiteId: string | null = null
    for (const integration of integrations) {
      const config = integration.config as Record<string, any>
      const secret = typeof config?.webhook_secret === 'string'
        ? safeDecrypt(config.webhook_secret)
        : undefined
      if (!secret) continue

      try {
        if (verifySvixSignature(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
          body = JSON.parse(rawBody) as Record<string, any>
          matchedSiteId = integration.siteId
          break
        }
      } catch {
        continue
      }
    }

    if (!body || !matchedSiteId) {
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
      'email.delivered': 'delivered',
    }

    const eventType = eventTypeMap[type]

    // Record against the compact delivery ledger if we have a message ID.
    if (eventType && messageId) {
      try {
        const result = await recordNewsletterDeliveryEvent(db, {
          siteId: matchedSiteId,
          providerMessageId: messageId,
          eventType: eventType as 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained',
          linkUrl: data?.click?.link || null,
        })

        if (result.matched && result.delivery) {
          // Update contact status on bounces/complaints
          if (result.counted && eventType === 'bounced' && result.delivery.contactId) {
            await db
              .update(newsletterContacts)
              .set({
                status: 'bounced',
                bounceCount: sql`${newsletterContacts.bounceCount} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(newsletterContacts.id, result.delivery.contactId))
          }

          if (result.counted && eventType === 'complained' && result.delivery.contactId) {
            await db
              .update(newsletterContacts)
              .set({ status: 'complained', updatedAt: new Date() })
              .where(eq(newsletterContacts.id, result.delivery.contactId))
          }

          // Update engagement
          if (result.counted && result.delivery.contactId && (eventType === 'opened' || eventType === 'clicked')) {
            await db
              .update(newsletterContacts)
              .set({ lastEngagedAt: new Date() })
              .where(eq(newsletterContacts.id, result.delivery.contactId))

            await syncDynamicSegmentsForContacts([result.delivery.contactId])
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
