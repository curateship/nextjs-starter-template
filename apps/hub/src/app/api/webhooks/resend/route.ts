import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { siteIntegrations, newsletterEvents, newsletterContacts, newsletters, productOrders } from '@/lib/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import crypto from 'crypto'
import { getFlodeskConfig } from '@/lib/actions/email/integration-actions'
import { getProductByIdAction } from '@/lib/actions/products/product-actions'
import { safeDecrypt } from '@/lib/utils/encryption'

/**
 * POST /api/webhooks/resend
 * Handle Resend webhook events (email.opened, email.clicked)
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

    let verified = false
    for (const integration of integrations) {
      const config = integration.config as Record<string, any>
      const secret = typeof config?.webhook_secret === 'string'
        ? safeDecrypt(config.webhook_secret)
        : undefined
      if (!secret) continue

      const PREFIX = 'whsec' + '_'
      const rawSecret = secret.startsWith(PREFIX) ? secret.slice(PREFIX.length) : secret
      const secretBytes = Buffer.from(rawSecret, 'base64')
      const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
      const expected = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64')

      verified = svixSignature.split(' ').some((sig: string) => {
        const [, sigValue] = sig.split(',')
        return sigValue === expected
      })

      if (verified) break
    }

    if (!verified) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)
    const { type, data } = body

    const email = data?.to?.[0] || data?.email
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
            const bounceType = data?.bounce?.type
            if (bounceType === 'hard') {
              await db
                .update(newsletterContacts)
                .set({ status: 'bounced' })
                .where(eq(newsletterContacts.id, existingEvent.contactId))
            } else {
              // Soft bounce — increment count, suppress after 3
              const [contact] = await db
                .select({ bounceCount: newsletterContacts.bounceCount })
                .from(newsletterContacts)
                .where(eq(newsletterContacts.id, existingEvent.contactId))
              const newCount = (contact?.bounceCount || 0) + 1
              await db
                .update(newsletterContacts)
                .set({ bounceCount: newCount, ...(newCount >= 3 ? { status: 'bounced' } : {}) })
                .where(eq(newsletterContacts.id, existingEvent.contactId))
            }
          }

          if (eventType === 'complained' && existingEvent.contactId) {
            await db
              .update(newsletterContacts)
              .set({ status: 'complained' })
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
          }
        }
      } catch (err) {
        console.error('Error recording newsletter event:', err)
        // Don't fail the webhook — continue to Flodesk logic below
      }
    }

    // Only handle email.opened and email.clicked for Flodesk integration
    if (type !== 'email.opened' && type !== 'email.clicked') {
      return NextResponse.json({ message: 'Event recorded' })
    }

    if (!email) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
    }

    console.log(`Resend webhook: ${type}`)

    // Find the most recent order for this email
    const [order] = await db
      .select()
      .from(productOrders)
      .where(and(
        eq(productOrders.customerEmail, email.toLowerCase().trim()),
        isNull(productOrders.flodeskAddedAt),
      ))
      .orderBy(desc(productOrders.createdAt))
      .limit(1)

    if (!order) {
      console.log(`No pending Flodesk addition found for ${email}`)
      return NextResponse.json({ message: 'No pending order found' })
    }

    // Check if order already added to Flodesk
    if (order.flodeskAddedAt) {
      console.log(`Already added to Flodesk: ${email}`)
      return NextResponse.json({ message: 'Already added to Flodesk' })
    }

    // Get Flodesk configuration for this site
    const flodeskConfig = await getFlodeskConfig(order.siteId)
    if (!flodeskConfig) {
      console.log(`No Flodesk configuration for site ${order.siteId}`)
      return NextResponse.json({ message: 'Flodesk not configured' })
    }

    // Get product details for tags
    const productResult = await getProductByIdAction(order.productId)
    if (!productResult.data) {
      console.error(`Product not found: ${order.productId}`)
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const product = productResult.data
    const leadMagnetBlock = (product.content_blocks as Record<string, any>)?.['lead-magnet']
    const flodeskSettings = leadMagnetBlock?.flodeskSettings || {}

    // Prepare subscriber data
    const orderMeta = order.metadata as Record<string, any> | null
    const subscriberData: any = {
      email,
      first_name: orderMeta?.first_name || '',
      last_name: orderMeta?.last_name || '',
    }

    // Add to segment if configured
    if (flodeskSettings.segmentId || flodeskConfig.segmentId) {
      subscriberData.segment_ids = [flodeskSettings.segmentId || flodeskConfig.segmentId]
    }

    // Add tags if configured
    if (flodeskSettings.tags && Array.isArray(flodeskSettings.tags) && flodeskSettings.tags.length > 0) {
      subscriberData.tags = flodeskSettings.tags
    }

    // Add subscriber to Flodesk
    try {
      const flodeskResponse = await fetch('https://api.flodesk.com/v1/subscribers', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(flodeskConfig.apiKey + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriberData),
      })

      if (!flodeskResponse.ok) {
        const errorText = await flodeskResponse.text()
        console.error(`Flodesk API error: ${flodeskResponse.status} - ${errorText}`)
        throw new Error(`Flodesk API error: ${flodeskResponse.status}`)
      }

      const flodeskData = await flodeskResponse.json()
      console.log(`Added ${email} to Flodesk:`, flodeskData)

      // Mark as added to Flodesk
      await db
        .update(productOrders)
        .set({
          flodeskAddedAt: new Date(),
          metadata: {
            ...orderMeta,
            flodesk_subscriber_id: flodeskData.id,
            flodesk_event_type: type,
          },
        })
        .where(eq(productOrders.id, order.id))

      return NextResponse.json({
        success: true,
        message: `Subscriber added to Flodesk on ${type}`,
      })
    } catch (flodeskError) {
      console.error('Error adding to Flodesk:', flodeskError)
      return NextResponse.json(
        { error: 'Failed to add to Flodesk' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in Resend webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
