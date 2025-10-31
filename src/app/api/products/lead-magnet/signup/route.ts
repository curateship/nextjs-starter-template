import { NextRequest, NextResponse } from 'next/server'
import { getProductByIdAction } from '@/lib/actions/products/product-actions'
import { getSiteByIdAction } from '@/lib/actions/sites/site-actions'
import { createFreeSignup, markEmailSent } from '@/lib/actions/email/order-actions'
import { sendLeadMagnetDeliveryEmail } from '@/lib/actions/email/lead-magnet-emails'

/**
 * POST /api/products/lead-magnet/signup
 * Handle lead magnet signups with Phase 2 integration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, productId, siteId } = body

    // Validate required fields
    if (!email || !productId || !siteId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Get product details
    const productResult = await getProductByIdAction(productId)
    if (!productResult.data) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      )
    }

    const product = productResult.data

    // Verify product has lead_magnet block
    const contentBlocks = product.content_blocks || {}
    const leadMagnetBlock = Object.values(contentBlocks).find(
      (block: any) => block.type === 'lead-magnet'
    ) as any

    if (!leadMagnetBlock) {
      return NextResponse.json(
        { success: false, error: 'Product does not have a lead magnet block' },
        { status: 400 }
      )
    }

    // Get site details
    const siteResult = await getSiteByIdAction(siteId)
    if (!siteResult.data) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      )
    }

    const site = siteResult.data

    // Determine site URL
    const siteUrl = site.custom_domain
      ? `https://${site.custom_domain}`
      : `https://${site.subdomain}.yourdomain.com`

    // Create order in product_orders table
    const order = await createFreeSignup({
      siteId,
      productId,
      email,
      metadata: {
        block_type: 'lead-magnet',
        user_agent: request.headers.get('user-agent'),
        referrer: request.headers.get('referer'),
      },
    })

    // Generate click tracking URL
    const clickTrackingUrl = `${siteUrl}/api/track/click/${order.access_token}?redirect=${encodeURIComponent(`/products/${product.slug}`)}`

    // Get email settings from lead magnet block
    const emailSettings = leadMagnetBlock.emailSettings || {}
    const emailContent = leadMagnetBlock.emailContent || '<p>Thank you for signing up! Click the button below to access your content.</p><p>{{DOWNLOAD_LINK}}</p>'

    // Send delivery email with click tracking
    try {
      await sendLeadMagnetDeliveryEmail({
        to: email,
        subject: emailSettings.subject || `Your ${product.title} is ready!`,
        fromName: emailSettings.fromName || site.name || 'Your Company',
        replyTo: emailSettings.replyTo,
        content: emailContent,
        clickTrackingUrl,
        productName: product.title,
        siteUrl,
      })

      // Mark email as sent
      await markEmailSent(order.id)

      console.log('Lead magnet email sent to:', email)
    } catch (emailError) {
      console.error('Failed to send lead magnet email:', emailError)
      // Don't fail the request - order was still created
      // User can still access content via dashboard
    }

    // Determine thank you page URL
    const thankYouUrl = leadMagnetBlock.thankYouUrl || `/products/${product.slug}/thank-you`

    return NextResponse.json({
      success: true,
      redirectUrl: thankYouUrl,
      orderId: order.id,
    })
  } catch (error) {
    console.error('Error in lead magnet signup:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process signup',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
