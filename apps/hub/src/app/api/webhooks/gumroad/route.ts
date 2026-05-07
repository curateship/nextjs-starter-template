import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { siteIntegrations } from '@/lib/db/schema'
import { upsertSystemNewsletterContact } from '@/lib/newsletters/system-contact-sync'
import { safeDecrypt } from '@/lib/utils/encryption'

export const runtime = 'nodejs'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type GumroadPayload = Record<string, unknown>

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function formPayloadFrom(rawBody: string): GumroadPayload {
  const payload: GumroadPayload = {}
  const params = new URLSearchParams(rawBody)

  params.forEach((value, key) => {
    if (payload[key] === undefined) {
      payload[key] = value
    }
  })

  return payload
}

async function parsePayload(request: NextRequest) {
  const rawBody = await request.text()
  if (!rawBody.trim()) return null

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody) as GumroadPayload
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return formPayloadFrom(rawBody)
  }

  try {
    return JSON.parse(rawBody) as GumroadPayload
  } catch {
    return formPayloadFrom(rawBody)
  }
}

async function validateWebhookRequest(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId')?.trim() || ''
  const secret = request.nextUrl.searchParams.get('secret') || ''
  const resource = request.nextUrl.searchParams.get('resource')?.trim() || 'sale'

  if (!UUID_REGEX.test(siteId) || !secret) {
    return {
      siteId: null,
      resource,
      response: NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 }),
    }
  }

  const [integration] = await db
    .select({ config: siteIntegrations.config })
    .from(siteIntegrations)
    .where(and(
      eq(siteIntegrations.siteId, siteId),
      eq(siteIntegrations.integrationType, 'gumroad'),
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
      resource,
      response: NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 }),
    }
  }

  return { siteId, resource, response: null }
}

function getGumroadMetadata(payload: GumroadPayload) {
  const receivedAt = new Date().toISOString()

  return {
    source: 'gumroad',
    gumroad_sale_id: safeString(payload.sale_id || payload.id) || null,
    gumroad_seller_id: safeString(payload.seller_id) || null,
    gumroad_product_id: safeString(payload.product_id) || null,
    gumroad_product_name: safeString(payload.product_name) || null,
    gumroad_permalink: safeString(payload.permalink) || null,
    gumroad_product_permalink: safeString(payload.product_permalink) || null,
    gumroad_price_cents: safeNumber(payload.price),
    gumroad_currency: safeString(payload.currency) || null,
    gumroad_quantity: safeNumber(payload.quantity),
    gumroad_purchaser_id: safeString(payload.purchaser_id) || null,
    gumroad_subscription_id: safeString(payload.subscription_id) || null,
    gumroad_sale_timestamp: safeString(payload.sale_timestamp || payload.created_at) || null,
    gumroad_last_sale_at: safeString(payload.sale_timestamp || payload.created_at) || receivedAt,
    gumroad_last_received_at: receivedAt,
  }
}

async function handleSalePayload(siteId: string, payload: GumroadPayload) {
  const email = safeString(payload.email || payload.purchase_email).toLowerCase()

  if (!email) {
    return NextResponse.json({ received: true, skipped: 'missing_email' })
  }

  if (email.length > 255 || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ received: true, skipped: 'invalid_email' })
  }

  const productName = safeString(payload.product_name)
  const result = await upsertSystemNewsletterContact({
    siteId,
    email,
    source: 'gumroad',
    tags: ['Gumroad', productName].filter(Boolean),
    extraMetadata: getGumroadMetadata(payload),
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

    if (validation.resource !== 'sale') {
      return NextResponse.json({ received: true, skipped: 'unsupported_resource' })
    }

    let payload: GumroadPayload | null
    try {
      payload = await parsePayload(request)
    } catch {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    if (!payload || !Object.keys(payload).length) {
      return NextResponse.json({ received: true, skipped: 'empty_test_payload' })
    }

    return await handleSalePayload(validation.siteId!, payload)
  } catch (error) {
    console.error('Gumroad webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
