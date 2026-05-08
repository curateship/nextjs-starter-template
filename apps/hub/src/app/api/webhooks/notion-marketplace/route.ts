import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { siteIntegrations } from '@/lib/db/schema'
import { upsertSystemNewsletterContact } from '@/lib/actions/newsletters/system-contact-sync'
import { safeDecrypt } from '@/lib/utils/encryption'

export const runtime = 'nodejs'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PURCHASE_EVENTS = new Set(['marketplace.purchase', 'marketplace.puchase'])
const REFUND_EVENT = 'marketplace.refund'

type NotionMarketplacePayload = Record<string, unknown>

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizeEvent(value: unknown) {
  const event = safeString(value)
  if (PURCHASE_EVENTS.has(event)) return 'marketplace.purchase'
  if (event === REFUND_EVENT) return REFUND_EVENT
  return ''
}

async function validateWebhookRequest(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId')?.trim() || ''
  const secret = request.nextUrl.searchParams.get('secret') || ''

  if (!UUID_REGEX.test(siteId) || !secret) {
    return {
      siteId: null,
      response: NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 }),
    }
  }

  const [integration] = await db
    .select({ config: siteIntegrations.config })
    .from(siteIntegrations)
    .where(and(
      eq(siteIntegrations.siteId, siteId),
      eq(siteIntegrations.integrationType, 'notion_marketplace'),
      eq(siteIntegrations.isEnabled, true),
    ))
    .limit(1)

  const config = integration?.config as Record<string, unknown> | undefined
  const configuredSecret = typeof config?.webhook_secret === 'string'
    ? safeDecrypt(config.webhook_secret)
    : ''

  if (!configuredSecret || !secureCompare(secret, configuredSecret)) {
    return {
      siteId: null,
      response: NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 }),
    }
  }

  return { siteId, response: null }
}

function getMarketplaceMetadata(payload: NotionMarketplacePayload, event: string) {
  const receivedAt = new Date().toISOString()
  const time = safeString(payload.time) || receivedAt
  const prefix = event === REFUND_EVENT ? 'refund' : 'purchase'

  return {
    source: 'notion_marketplace',
    notion_marketplace_event: event,
    notion_marketplace_acquisition_id: safeString(payload.acquisitionId) || null,
    notion_marketplace_template_name: safeString(payload.templateName) || null,
    notion_marketplace_template_slug: safeString(payload.templateSlug) || null,
    notion_marketplace_listing_price_cents: safeNumber(payload.listingPrice),
    notion_marketplace_total_customer_payment_cents: safeNumber(payload.totalCustomerPayment ?? payload.totalPrice),
    notion_marketplace_discounted_price_cents: safeNumber(payload.discountedPrice),
    notion_marketplace_tax_amount_cents: safeNumber(payload.taxAmount),
    notion_marketplace_seller_transfer_amount_cents: safeNumber(payload.sellerTransferAmount),
    notion_marketplace_coupon_code: safeString(payload.couponCode) || null,
    notion_marketplace_locale: safeString(payload.locale) || null,
    notion_marketplace_source: safeString(payload.source) || null,
    notion_marketplace_last_event_at: time,
    [`last_notion_marketplace_${prefix}_at`]: time,
    notion_marketplace_last_received_at: receivedAt,
  }
}

async function handleMarketplacePayload(siteId: string, payload: NotionMarketplacePayload) {
  const event = normalizeEvent(payload.event ?? payload.type)

  if (!event) {
    return NextResponse.json({ received: true, skipped: 'test_or_unsupported_event' })
  }

  const customerEmail = safeString(payload.customerEmail).toLowerCase()
  if (!customerEmail) {
    return NextResponse.json({ received: true, skipped: 'missing_customer_email' })
  }

  if (customerEmail.length > 255 || !EMAIL_REGEX.test(customerEmail)) {
    return NextResponse.json({ received: true, skipped: 'invalid_customer_email' })
  }

  const templateName = safeString(payload.templateName)
  const tags = [templateName, event === REFUND_EVENT ? 'Refunded' : '']
    .filter(Boolean)

  const result = await upsertSystemNewsletterContact({
    siteId,
    email: customerEmail,
    source: 'notion_marketplace',
    tags,
    extraMetadata: getMarketplaceMetadata(payload, event),
  })

  if (result.error) {
    return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 })
  }

  return NextResponse.json({ received: true, contactId: result.id })
}

export async function GET(request: NextRequest) {
  const validation = await validateWebhookRequest(request)
  if (validation.response) return validation.response
  return NextResponse.json({ received: true })
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateWebhookRequest(request)
    if (validation.response) return validation.response

    const rawBody = await request.text()
    if (!rawBody.trim()) {
      return NextResponse.json({ received: true, skipped: 'empty_test_payload' })
    }

    let payload: NotionMarketplacePayload
    try {
      payload = JSON.parse(rawBody) as NotionMarketplacePayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    return await handleMarketplacePayload(validation.siteId!, payload)
  } catch (error) {
    console.error('Notion Marketplace webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
