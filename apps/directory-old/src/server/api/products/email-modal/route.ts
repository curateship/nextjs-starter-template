import { NextRequest, NextResponse } from '@/lib/web-response'
import { and, eq } from 'drizzle-orm'

import { getEmailProvider } from '@/lib/actions/email/provider'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/actions/email/system-email'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { upsertSystemNewsletterContact } from '@/lib/actions/newsletters/system-contact-sync'
import {
  normalizeProductEmailModalContent,
  PRODUCT_EMAIL_MODAL_CONTACT_SOURCE,
  renderProductEmailModalTokens,
} from '@/lib/actions/products/email-modal'
import { db } from '@/lib/db'
import { products, sites } from '@/lib/db/schema'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { sanitizeRichMediaHtml } from '@/lib/utils/html-sanitizer'
import { getClientIp, isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { UUID_REGEX } from '@/lib/utils/validation'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const BLOCK_ID_REGEX = /^[A-Za-z0-9_-]{1,180}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

    const [site] = await db
      .select({
        id: sites.id,
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

    const emailModalBlock = convertContentBlocksToArray(
      (product.contentBlocks || {}) as Record<string, any>,
      product.id,
    ).find((block) => block.id === blockId && block.type === 'product-email-modal')

    if (!emailModalBlock || emailModalBlock.content?.visibility?.hideBlock === true) {
      return NextResponse.json({ success: false, error: 'Email modal not found' }, { status: 404 })
    }

    const rateLimitKey = `${getClientIp(request.headers) || 'unknown'}:product-email-modal`
    if (await isPersistentRateLimited(rateLimitKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const blockContent = normalizeProductEmailModalContent(emailModalBlock.content)

    const result = await upsertSystemNewsletterContact({
      siteId,
      email,
      source: PRODUCT_EMAIL_MODAL_CONTACT_SOURCE,
      tags: [product.title],
      extraMetadata: {
        source_product_id: product.id,
        source_product_title: product.title,
        product_email_modal_block_id: blockId,
        last_product_email_modal_signup_at: new Date().toISOString(),
      },
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: 'Failed to subscribe' }, { status: 500 })
    }

    const config = await getEmailConfig(siteId)
    if (!config?.apiKey || !config.fromEmail) {
      console.error('Skipping product email modal delivery email: email is not configured for site', siteId)
      return NextResponse.json({ success: false, error: 'Delivery email unavailable' }, { status: 500 })
    }

    const productDeliveryEmail = sanitizeRichMediaHtml(
      renderProductEmailModalTokens(blockContent.deliveryEmailBody, product.title, { html: true })
    ).trim()
    const template = await getSystemEmailTemplate('product_email_modal_delivery', siteId)
    const tokens = await buildSystemEmailTokens({
      siteId,
      productId: product.id,
      productName: product.title,
      productSlug: product.slug,
      productDeliveryEmail,
      subscriberEmail: email,
    })
    const fromName = template.from_name || config.fromName
    const provider = getEmailProvider(config.apiKey, config.providerType)
    const emailResult = await provider.send({
      from: fromName ? `${fromName} <${config.fromEmail}>` : config.fromEmail,
      to: email,
      subject: renderSystemEmailSubject(template.subject, tokens),
      html: renderSystemEmailContent(template, tokens),
      replyTo: template.reply_to || undefined,
    })

    if (!emailResult.success) {
      console.error('Product email modal delivery email failed:', emailResult.error)
      return NextResponse.json({ success: false, error: 'Delivery email failed' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Product email modal signup error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
