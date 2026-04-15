import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newsletterContacts, products, sites } from '@/lib/db/schema'
import { and, eq, gte, sql } from 'drizzle-orm'
import { createFreeSignup, markEmailSent } from '@/lib/actions/email/order-actions'
import { sendLeadMagnetDeliveryEmail } from '@/lib/actions/email/lead-magnet-emails'
import { getEmailConfig } from '@/lib/actions/email/integration-actions'
import { findActiveAutomations, enrollContact } from '@/lib/actions/newsletters/automation-actions'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/email/system-email'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5

const signupRateLimitStore = new Map<string, number[]>()

function getClientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function isRateLimited(key: string) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recentAttempts = (signupRateLimitStore.get(key) || []).filter((timestamp) => timestamp > windowStart)

  if (recentAttempts.length >= RATE_LIMIT_MAX_REQUESTS) {
    signupRateLimitStore.set(key, recentAttempts)
    return true
  }

  recentAttempts.push(now)
  signupRateLimitStore.set(key, recentAttempts)
  return false
}

function hasAllowedOrigin(request: NextRequest, siteUrl: string) {
  const allowedOrigin = new URL(siteUrl).origin
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  try {
    if (origin) {
      return new URL(origin).origin === allowedOrigin
    }

    if (referer) {
      return new URL(referer).origin === allowedOrigin
    }
  } catch {
    return false
  }

  return false
}

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

    const [site] = await db
      .select({
        id: sites.id,
        name: sites.name,
        subdomain: sites.subdomain,
        customDomain: sites.customDomain,
      })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site) {
      return NextResponse.json(
        { success: false, error: 'Site not found' },
        { status: 404 }
      )
    }

    const siteUrl = getSiteUrl({
      subdomain: site.subdomain,
      customDomain: site.customDomain,
    })

    if (!hasAllowedOrigin(request, siteUrl)) {
      return NextResponse.json(
        { success: false, error: 'Invalid origin' },
        { status: 403 }
      )
    }

    const rateLimitKey = `${getClientIp(request)}:${siteId}:${productId}`
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      )
    }

    // Get product details scoped to the site
    const [product] = await db
      .select()
      .from(products)
      .where(and(
        eq(products.id, productId),
        eq(products.siteId, siteId),
      ))
      .limit(1)

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      )
    }

    // Verify product has product-lead-magnet block
    const contentBlocks = (product.contentBlocks as Record<string, any>) || {}
    const leadMagnetBlock = contentBlocks['product-lead-magnet']

    if (!leadMagnetBlock) {
      return NextResponse.json(
        { success: false, error: 'Product does not have a lead magnet block' },
        { status: 400 }
      )
    }

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
      const [contact] = await db
        .insert(newsletterContacts)
        .values({
          siteId,
          email: email.toLowerCase(),
          metadata: { source: 'lead_magnet', source_product_id: productId },
        })
        .onConflictDoUpdate({
          target: [newsletterContacts.siteId, newsletterContacts.email],
          set: {
            metadata: sql`coalesce(${newsletterContacts.metadata}, '{}'::jsonb) || ${JSON.stringify({
              source: 'lead_magnet',
              source_product_id: productId,
            })}::jsonb`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: newsletterContacts.id })

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

    // Get per-site email config
    const emailConfig = await getEmailConfig(siteId)

    if (!emailConfig) {
      console.error('Email provider not configured for site:', siteId)
      return NextResponse.json({ success: true, message: 'Order created but email not configured' })
    }

    // Send delivery email with content
    try {
      const template = await getSystemEmailTemplate('lead_magnet_delivery', siteId)
      const tokens = await buildSystemEmailTokens({
        siteId,
        productId,
        productName: product.title,
        productSlug: product.slug,
      })

      await sendLeadMagnetDeliveryEmail({
        to: email,
        subject: renderSystemEmailSubject(template.subject, tokens),
        fromName: template.from_name || emailConfig.fromName || site.name || 'Your Company',
        fromEmail: emailConfig.fromEmail,
        replyTo: template.reply_to || undefined,
        content: renderSystemEmailContent(template, tokens),
        productName: product.title,
        siteUrl,
        apiKey: emailConfig.apiKey,
        providerType: emailConfig.providerType,
      })

      // Mark email as sent
      await markEmailSent(order.id)
    } catch (emailError) {
      console.error('Failed to send lead magnet email:', emailError)
      // Don't fail the request - order was still created
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
