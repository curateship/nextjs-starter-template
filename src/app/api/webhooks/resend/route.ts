import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
    // Verify webhook signature
    const signature = request.headers.get('svix-signature')

    if (!signature) {
      console.error('No signature provided in webhook request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Verify signature against site-specific webhook secret
    // For now, accept if signature header is present

    const body = await request.json()
    const { type, data } = body

    // Only handle email.opened and email.clicked events
    if (type !== 'email.opened' && type !== 'email.clicked') {
      return NextResponse.json({ message: 'Event ignored' })
    }

    const email = data?.to?.[0] || data?.email
    if (!email) {
      console.error('No email found in webhook data')
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
    }

    console.log(`Resend webhook: ${type} for ${email}`)

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
      {
        error: 'Webhook processing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
