import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSiteByIdAction } from '@/lib/actions/sites/site-actions'
import { createFreeSignup, markEmailSent } from '@/lib/actions/email/order-actions'
import { sendLeadMagnetDeliveryEmail } from '@/lib/actions/email/lead-magnet-emails'
import { getFlodeskConfig, getResendConfig } from '@/lib/actions/email/integration-actions'
import { flodeskService } from '@/lib/actions/email/flodesk-service'
import { findActiveAutomations, enrollContact } from '@/lib/actions/newsletters/automation-actions'

// Server-side only: bypasses RLS since visitors aren't authenticated.
// Safe because this route only reads specific products/sites by ID.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * POST /api/products/lead-magnet/signup
 * Handle lead magnet signups - simplified version
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

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId) || !uuidRegex.test(productId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
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

    // Get product details (using admin client — visitors are not authenticated)
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      )
    }

    // Verify product has product-lead-magnet block
    const contentBlocks = product.content_blocks || {}
    const leadMagnetBlock = contentBlocks['product-lead-magnet']

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
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'
    const isLocalDev = appDomain.includes('localhost')
    const siteUrl = isLocalDev
      ? appDomain
      : (site.custom_domain
          ? `https://${site.custom_domain}`
          : `https://${site.subdomain}.yourdomain.com`)

    // Create order in product_orders table
    const order = await createFreeSignup({
      siteId,
      productId,
      email,
      metadata: {
        block_type: 'product-lead-magnet',
        user_agent: request.headers.get('user-agent'),
        referrer: request.headers.get('referer'),
      },
    })

    // Add to newsletter contacts + enroll in automations
    try {
      const { data: contact } = await supabaseAdmin
        .from('newsletter_contacts')
        .upsert({
          site_id: siteId,
          email: email.toLowerCase(),
          metadata: { source: 'lead_magnet', source_product_id: productId },
        }, { onConflict: 'site_id,email' })
        .select('id')
        .single()

      if (contact) {
        const automations = await findActiveAutomations(siteId, 'lead_magnet_signup', productId)
        for (const automation of automations) {
          await enrollContact(automation.id, contact.id)
        }
      }
    } catch (err) {
      console.error('Newsletter contact/enrollment error:', err)
      // Don't fail the signup
    }

    // Get email settings from lead magnet block
    const emailSettings = leadMagnetBlock.emailSettings || {}

    // Get email content
    const emailContent = emailSettings.content || ''

    // Get per-site Resend config
    const resendConfig = await getResendConfig(siteId)

    if (!resendConfig) {
      console.error('Resend not configured for site:', siteId)
      return NextResponse.json({ success: true, message: 'Order created but email not configured' })
    }

    // Send delivery email with content
    try {
      await sendLeadMagnetDeliveryEmail({
        to: email,
        subject: emailSettings.subject || `Your ${product.title} is ready!`,
        fromName: emailSettings.fromName || site.name || 'Your Company',
        fromEmail: resendConfig.fromEmail,
        replyTo: emailSettings.replyTo,
        content: emailContent,
        productName: product.title,
        siteUrl,
        apiKey: resendConfig.apiKey,
      })

      // Mark email as sent
      await markEmailSent(order.id)

      console.log('Lead magnet email sent successfully')
    } catch (emailError) {
      console.error('Failed to send lead magnet email:', emailError)
      // Don't fail the request - order was still created
    }

    // Add to Flodesk if enabled
    const flodeskSettings = leadMagnetBlock.flodeskSettings
    if (flodeskSettings?.enabled) {
      try {
        // Get Flodesk configuration (site-specific or fallback to env)
        const flodeskConfig = await getFlodeskConfig(siteId)

        if (flodeskConfig) {
          // Add subscriber to Flodesk with configured settings
          const result = await flodeskService.addSubscriber(flodeskConfig, {
            email,
            segmentId: flodeskSettings.segmentId || flodeskConfig.segmentId,
            tags: flodeskSettings.tags || [],
          })

          if (result.success) {
            console.log('Added to Flodesk successfully')
          } else {
            console.error('Failed to add to Flodesk:', result.error)
          }
        } else {
          console.warn('Flodesk enabled but no API key configured')
        }
      } catch (flodeskError) {
        console.error('Error adding to Flodesk:', flodeskError)
        // Don't fail the request - email was already sent
      }
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
    })
  } catch (error) {
    console.error('Error in lead magnet signup:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process signup' },
      { status: 500 }
    )
  }
}
