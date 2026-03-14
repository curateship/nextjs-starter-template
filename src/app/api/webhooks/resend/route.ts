import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getFlodeskConfig } from '@/lib/actions/email/integration-actions'
import { getProductByIdAction } from '@/lib/actions/products/product-actions'

// Create admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

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

    // Try all Resend integrations to find a matching webhook secret (same pattern as Stripe)
    const { data: integrations } = await supabaseAdmin
      .from('site_integrations')
      .select('site_id, config')
      .eq('integration_type', 'resend')
      .eq('is_enabled', true)

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ error: 'No Resend integrations configured' }, { status: 400 })
    }

    let verified = false
    for (const integration of integrations) {
      const secret = integration.config?.webhook_secret
      if (!secret) continue

      const PREFIX = 'whsec' + '_'
      const rawSecret = secret.startsWith(PREFIX) ? secret.slice(PREFIX.length) : secret
      const secretBytes = Buffer.from(rawSecret, 'base64')
      const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
      const expected = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64')

      verified = svixSignature.split(' ').some(sig => {
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
        // Find the event record by resend_message_id to get contact_id and source
        const { data: existingEvent } = await supabaseAdmin
          .from('newsletter_events')
          .select('site_id, contact_id, source_type, source_id')
          .eq('resend_message_id', messageId)
          .limit(1)
          .single()

        if (existingEvent) {
          await supabaseAdmin.from('newsletter_events').insert({
            site_id: existingEvent.site_id,
            contact_id: existingEvent.contact_id,
            event_type: eventType,
            source_type: existingEvent.source_type,
            source_id: existingEvent.source_id,
            resend_message_id: messageId,
            metadata: { link_url: data?.click?.link, bounce_type: data?.bounce?.type },
          })

          // Update contact status on bounces/complaints
          if (eventType === 'bounced' && existingEvent.contact_id) {
            const bounceType = data?.bounce?.type
            if (bounceType === 'hard') {
              await supabaseAdmin
                .from('newsletter_contacts')
                .update({ status: 'bounced' })
                .eq('id', existingEvent.contact_id)
            } else {
              // Soft bounce — increment count, suppress after 3
              const { data: contact } = await supabaseAdmin
                .from('newsletter_contacts')
                .select('bounce_count')
                .eq('id', existingEvent.contact_id)
                .single()
              const newCount = (contact?.bounce_count || 0) + 1
              await supabaseAdmin
                .from('newsletter_contacts')
                .update({ bounce_count: newCount, ...(newCount >= 3 ? { status: 'bounced' } : {}) })
                .eq('id', existingEvent.contact_id)
            }
          }

          if (eventType === 'complained' && existingEvent.contact_id) {
            await supabaseAdmin
              .from('newsletter_contacts')
              .update({ status: 'complained' })
              .eq('id', existingEvent.contact_id)
          }

          // Update newsletter open/click counts
          if (existingEvent.source_type === 'broadcast' && existingEvent.source_id) {
            const statField = eventType === 'opened' ? 'total_opened' : eventType === 'clicked' ? 'total_clicked' : null
            if (statField) {
              const { data: bc } = await supabaseAdmin
                .from('newsletters')
                .select(statField)
                .eq('id', existingEvent.source_id)
                .single()
              if (bc) {
                await supabaseAdmin
                  .from('newsletters')
                  .update({ [statField]: ((bc as Record<string, number>)[statField] || 0) + 1 })
                  .eq('id', existingEvent.source_id)
              }
            }
          }

          // Update engagement
          if (existingEvent.contact_id && (eventType === 'opened' || eventType === 'clicked')) {
            await supabaseAdmin
              .from('newsletter_contacts')
              .update({ last_engaged_at: new Date().toISOString() })
              .eq('id', existingEvent.contact_id)
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
    const { data: orders, error: orderError } = await supabaseAdmin
      .from('product_orders')
      .select('*')
      .eq('customer_email', email.toLowerCase().trim())
      .is('flodesk_added_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (orderError) {
      console.error('Error fetching order:', orderError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!orders || orders.length === 0) {
      console.log(`No pending Flodesk addition found for ${email}`)
      return NextResponse.json({ message: 'No pending order found' })
    }

    const order = orders[0]

    // Check if order already added to Flodesk
    if (order.flodesk_added_at) {
      console.log(`Already added to Flodesk: ${email}`)
      return NextResponse.json({ message: 'Already added to Flodesk' })
    }

    // Get Flodesk configuration for this site
    const flodeskConfig = await getFlodeskConfig(order.site_id)
    if (!flodeskConfig) {
      console.log(`No Flodesk configuration for site ${order.site_id}`)
      return NextResponse.json({ message: 'Flodesk not configured' })
    }

    // Get product details for tags
    const productResult = await getProductByIdAction(order.product_id)
    if (!productResult.data) {
      console.error(`Product not found: ${order.product_id}`)
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const product = productResult.data
    const leadMagnetBlock = product.content_blocks?.['lead-magnet']
    const flodeskSettings = leadMagnetBlock?.flodeskSettings || {}

    // Prepare subscriber data
    const subscriberData: any = {
      email,
      first_name: order.metadata?.first_name || '',
      last_name: order.metadata?.last_name || '',
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
      const { error: updateError } = await supabaseAdmin
        .from('product_orders')
        .update({
          flodesk_added_at: new Date().toISOString(),
          metadata: {
            ...order.metadata,
            flodesk_subscriber_id: flodeskData.id,
            flodesk_event_type: type,
          },
        })
        .eq('id', order.id)

      if (updateError) {
        console.error('Error updating order:', updateError)
      }

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
