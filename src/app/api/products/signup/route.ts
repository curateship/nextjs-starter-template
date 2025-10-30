import { NextRequest, NextResponse } from 'next/server'
import { getProductBySlug } from '@/lib/actions/products/product-actions'
import { createFreeSignup, markEmailSent } from '@/lib/actions/email/order-actions'
import { getResendConfig } from '@/lib/actions/email/integration-actions'
import { emailService } from '@/lib/actions/email/email-service'

/**
 * POST /api/products/signup
 * Handle free product signup - create record and send email
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json()
    const { email, productSlug } = body

    // Validate required fields
    if (!email || !productSlug) {
      return NextResponse.json(
        { error: 'Email and product slug are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    // Get product by slug
    const product = await getProductBySlug(productSlug)
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Check if product has a lead_magnet block
    const contentBlocks = product.content_blocks as Record<string, any>
    const leadMagnetBlock = Object.values(contentBlocks).find(
      (block: any) => block.type === 'lead_magnet'
    )

    if (!leadMagnetBlock) {
      return NextResponse.json(
        { error: 'This product is not available as a free lead magnet' },
        { status: 400 }
      )
    }

    // Collect metadata (user agent, referrer, etc.)
    const metadata = {
      userAgent: request.headers.get('user-agent') || undefined,
      referer: request.headers.get('referer') || undefined,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    }

    // Create signup record
    const signup = await createFreeSignup({
      siteId: product.site_id,
      productId: product.id,
      email: email,
      metadata,
    })

    // Get Resend configuration for this site
    const resendConfig = await getResendConfig(product.site_id)

    // Get email settings from lead magnet block
    const emailSettings = leadMagnetBlock.emailSettings || {}
    const emailContent = leadMagnetBlock.emailContent || '<p>Thank you for signing up!</p>'

    const subject = emailSettings.subject || `Your ${product.title} is ready!`
    const fromName = emailSettings.fromName || resendConfig.fromName
    const fromEmail = emailSettings.replyTo || resendConfig.fromEmail

    // Send email with product content
    const emailResult = await emailService.sendProductDeliveryEmail({
      to: email,
      subject,
      productTitle: product.title,
      content: emailContent,
      productSlug: product.slug,
      token: signup.access_token,
      config: {
        apiKey: resendConfig.apiKey,
        fromEmail: fromEmail,
        fromName: fromName,
      },
    })

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error)
      // Don't fail the request - email might be queued or retried
      // Just log the error and continue
    } else {
      // Mark email as sent
      await markEmailSent(signup.id)
    }

    // Return success with redirect URL
    const thankYouUrl = `/products/${product.slug}/free-thank-you?email=${encodeURIComponent(email)}`

    return NextResponse.json({
      success: true,
      redirectUrl: thankYouUrl,
      message: 'Check your email for your product content!',
    })

  } catch (error) {
    console.error('Error in product signup:', error)
    return NextResponse.json(
      {
        error: 'Failed to process signup. Please try again.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/products/signup
 * Method not allowed
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to signup.' },
    { status: 405 }
  )
}
