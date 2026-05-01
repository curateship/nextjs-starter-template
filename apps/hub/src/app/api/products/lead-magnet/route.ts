import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'

import { emailService } from '@/lib/actions/email/email-service'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { findActiveAutomations, enrollContact } from '@/lib/actions/newsletters/automation-actions'
import { db } from '@/lib/db'
import { productOrders, products, sites } from '@/lib/db/schema'
import { upsertSystemNewsletterContact } from '@/lib/newsletters/system-contact-sync'
import {
  normalizeLeadMagnetEmailSubject,
  normalizeProductLeadMagnetContent,
  renderProductLeadMagnetShortcodes,
} from '@/lib/products/lead-magnet'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { sanitizeRichMediaHtml } from '@/lib/utils/html-sanitizer'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BLOCK_ID_REGEX = /^[A-Za-z0-9_-]{1,180}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const signupRateLimitStore = new Map<string, number[]>()

function generateAccessToken() {
  return randomBytes(32).toString('base64url')
}

function getClientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function isRateLimited(key: string) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recentAttempts = (signupRateLimitStore.get(key) || [])
    .filter((timestamp) => timestamp > windowStart)

  if (recentAttempts.length >= RATE_LIMIT_MAX_REQUESTS) {
    signupRateLimitStore.set(key, recentAttempts)
    return true
  }

  recentAttempts.push(now)
  signupRateLimitStore.set(key, recentAttempts)
  return false
}

function hasAllowedOrigin(request: NextRequest, siteUrl: string) {
  const allowedHost = new URL(siteUrl).host
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  try {
    if (origin) return new URL(origin).host === allowedHost
    if (referer) return new URL(referer).host === allowedHost
  } catch {
    return false
  }

  return false
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : ''
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
    const blockId = typeof body?.blockId === 'string' ? body.blockId.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (
      !UUID_REGEX.test(siteId)
      || !UUID_REGEX.test(productId)
      || !BLOCK_ID_REGEX.test(blockId)
      || !email
      || email.length > 255
      || !EMAIL_REGEX.test(email)
    ) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const rateLimitKey = `${getClientIp(request)}:${siteId}:${productId}:lead-magnet`
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
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
      return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 })
    }

    const siteUrl = getSiteUrl({
      subdomain: site.subdomain,
      customDomain: site.customDomain,
    })

    if (!hasAllowedOrigin(request, siteUrl)) {
      return NextResponse.json({ success: false, error: 'Invalid origin' }, { status: 403 })
    }

    const [product] = await db
      .select({
        id: products.id,
        siteId: products.siteId,
        title: products.title,
        slug: products.slug,
        contentBlocks: products.contentBlocks,
      })
      .from(products)
      .where(and(
        eq(products.id, productId),
        eq(products.siteId, siteId),
        eq(products.isPublished, true),
      ))
      .limit(1)

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
    }

    const leadMagnetBlock = convertContentBlocksToArray(
      (product.contentBlocks || {}) as Record<string, any>,
      product.id,
    ).find((block) => block.id === blockId && block.type === 'product-lead-magnet')

    if (!leadMagnetBlock || leadMagnetBlock.content?.visibility?.hideBlock === true) {
      return NextResponse.json({ success: false, error: 'Lead magnet not found' }, { status: 404 })
    }

    const blockContent = normalizeProductLeadMagnetContent(leadMagnetBlock.content)

    const order = await db.transaction(async (tx) => {
      const lockKey = `${siteId}:${productId}:${email}`
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`)

      const [existingOrder] = await tx
        .select({
          id: productOrders.id,
          accessToken: productOrders.accessToken,
        })
        .from(productOrders)
        .where(and(
          eq(productOrders.siteId, siteId),
          eq(productOrders.productId, productId),
          eq(productOrders.customerEmail, email),
          eq(productOrders.orderType, 'lead_magnet' as any),
        ))
        .limit(1)

      if (existingOrder) return existingOrder

      const [createdOrder] = await tx
        .insert(productOrders)
        .values({
          siteId,
          productId,
          customerEmail: email,
          orderType: 'lead_magnet' as any,
          accessToken: generateAccessToken(),
          metadata: {
            source: 'lead_magnet',
            block_id: blockId,
          },
        })
        .returning({
          id: productOrders.id,
          accessToken: productOrders.accessToken,
        })

      return createdOrder
    })

    if (!order) {
      return NextResponse.json({ success: false, error: 'Failed to save signup' }, { status: 500 })
    }

    const contactResult = await upsertSystemNewsletterContact({
      siteId,
      email,
      source: 'lead_magnet',
      tags: [product.title],
      extraMetadata: {
        source_product_id: product.id,
        source_product_title: product.title,
        lead_magnet_block_id: blockId,
        last_lead_magnet_signup_at: new Date().toISOString(),
      },
    })

    if (contactResult.error) {
      console.error('Failed to save lead magnet contact:', contactResult.error)
    }

    if (contactResult.id) {
      const automations = await findActiveAutomations(siteId, 'lead_magnet_signup', product.id)
      await Promise.all(automations.map((automation) => enrollContact(automation.id, contactResult.id!)))
    }

    const config = await getEmailConfig(siteId)
    if (!config?.apiKey || !config.fromEmail) {
      console.error('Skipping lead magnet delivery email: email is not configured for site', siteId)
      return NextResponse.json({ success: false, error: 'Delivery email unavailable' }, { status: 500 })
    }

    const result = await emailService.sendProductDeliveryEmail({
      to: email,
      subject: normalizeLeadMagnetEmailSubject(blockContent.deliveryEmailSubject, product.title),
      productTitle: product.title,
      content: '',
      productSlug: product.slug,
      token: order.accessToken,
      rawHtml: sanitizeRichMediaHtml(
        renderProductLeadMagnetShortcodes(blockContent.deliveryEmailBody, product.title, { html: true })
      ).trim(),
      config,
    })

    if (!result.success) {
      console.error('Lead magnet delivery email failed:', result.error)
      return NextResponse.json({ success: false, error: 'Delivery email failed' }, { status: 502 })
    }

    await db
      .update(productOrders)
      .set({
        emailSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(productOrders.id, order.id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Lead magnet signup error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
