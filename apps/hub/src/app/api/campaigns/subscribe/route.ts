import { and, eq, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { upsertSystemNewsletterContact } from '@/lib/actions/newsletters/system-contact-sync'
import { db } from '@/lib/db'
import { campaigns, sites } from '@/lib/db/schema'
import type { PopupCampaignContent } from '@/lib/campaigns/campaigns'
import { getClientIp, isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { UUID_REGEX } from '@/lib/utils/validation'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_BODY_BYTES = 4_096

function hasAllowedOrigin(request: NextRequest, siteUrl: string) {
  const requestHost = request.headers.get('host') || ''
  const localRequest = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestHost)
  const candidate = request.headers.get('origin') || request.headers.get('referer')
  if (!candidate) return false
  try {
    const host = new URL(candidate).host
    return host === new URL(siteUrl).host || (localRequest && host === requestHost)
  } catch { return false }
}

export async function POST(request: NextRequest) {
  try {
    const contentLengthHeader = request.headers.get('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (!Number.isFinite(contentLength) || contentLength < 0) {
        return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
      }
      if (contentLength > MAX_BODY_BYTES) {
        return NextResponse.json({ success: false, error: 'Request too large' }, { status: 413 })
      }
    }

    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Request too large' }, { status: 413 })
    }
    let body: unknown
    try { body = JSON.parse(rawBody) } catch {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }
    const payload = typeof body === 'object' && body !== null ? body as Record<string, unknown> : null
    const siteId = typeof payload?.siteId === 'string' ? payload.siteId.trim() : ''
    const campaignId = typeof payload?.campaignId === 'string' ? payload.campaignId.trim() : ''
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''
    if (!UUID_REGEX.test(siteId) || !UUID_REGEX.test(campaignId) || email.length > 255 || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    const now = new Date()
    const [row] = await db.select({
      id: campaigns.id,
      name: campaigns.name,
      content: campaigns.content,
      subdomain: sites.subdomain,
      customDomain: sites.customDomain,
    }).from(campaigns).innerJoin(sites, eq(campaigns.siteId, sites.id)).where(and(
      eq(campaigns.id, campaignId),
      eq(campaigns.siteId, siteId),
      eq(campaigns.type, 'popup'),
      eq(campaigns.status, 'active'),
      or(sql`${campaigns.startsAt} is null`, sql`${campaigns.startsAt} <= ${now}`),
      or(sql`${campaigns.endsAt} is null`, sql`${campaigns.endsAt} > ${now}`),
    )).limit(1)
    const content = row?.content as PopupCampaignContent | undefined
    if (!row || content?.goal !== 'email') return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })

    const siteUrl = getSiteUrl({ subdomain: row.subdomain, customDomain: row.customDomain })
    if (!hasAllowedOrigin(request, siteUrl)) return NextResponse.json({ success: false, error: 'Invalid origin' }, { status: 403 })

    const key = `${getClientIp(request.headers) || 'unknown'}:${siteId}:campaign-subscribe`
    if (await isPersistentRateLimited(key, 5, 60_000)) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const result = await upsertSystemNewsletterContact({
      siteId,
      email,
      source: 'Campaign',
      preserveExistingSource: true,
      tags: ['Campaign', row.name],
      extraMetadata: { campaign_id: campaignId, last_campaign_signup_at: now.toISOString() },
    })
    if (result.error) return NextResponse.json({ success: false, error: 'Failed to subscribe' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Campaign subscribe error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
