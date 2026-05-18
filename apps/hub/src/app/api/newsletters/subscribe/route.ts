import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { getEmailConfig } from '@/lib/actions/email/integration-actions'
import { getEmailProvider } from '@/lib/actions/email/provider'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/actions/email/system-email'
import {
  EMAIL_FORM_CONTACT_SOURCE,
  EMAIL_FORM_CONTACT_TAG,
  upsertSystemNewsletterContact,
} from '@/lib/actions/newsletters/system-contact-sync'
import { sanitizeRichMediaHtml } from '@/lib/utils/html-sanitizer'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const MAX_IDENTIFIER_LENGTH = 100
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BLOCK_ID_REGEX = /^[A-Za-z0-9_-]{1,180}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const subscribeRateLimitStore = new Map<string, number[]>()

function getClientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function isRateLimited(key: string) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recentAttempts = (subscribeRateLimitStore.get(key) || []).filter((timestamp) => timestamp > windowStart)

  if (recentAttempts.length >= RATE_LIMIT_MAX_REQUESTS) {
    subscribeRateLimitStore.set(key, recentAttempts)
    return true
  }

  recentAttempts.push(now)
  subscribeRateLimitStore.set(key, recentAttempts)
  return false
}

function hasAllowedOrigin(request: NextRequest, siteUrl: string) {
  const allowedHost = new URL(siteUrl).host
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  try {
    if (origin) {
      return new URL(origin).host === allowedHost
    }

    if (referer) {
      return new URL(referer).host === allowedHost
    }
  } catch {
    return false
  }

  return false
}

async function getPagesHeroContent(siteId: string, blockId: string) {
  const pageRows = await db
    .select({ contentBlocks: pages.contentBlocks })
    .from(pages)
    .where(and(eq(pages.siteId, siteId), eq(pages.isPublished, true)))

  for (const page of pageRows) {
    const block = (page.contentBlocks as Record<string, any> | null)?.[blockId]
    if (block?.type === 'hero' && typeof block.content?.emailTemplateBody === 'string') {
      return block.content.emailTemplateBody
    }
  }

  return ''
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : ''
    const blockId = typeof body?.blockId === 'string' ? body.blockId.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const identifier = typeof body?.identifier === 'string'
      ? body.identifier.trim().replace(/\s+/g, ' ')
      : ''

    if (
      !UUID_REGEX.test(siteId)
      || (blockId && !BLOCK_ID_REGEX.test(blockId))
      || !email
      || email.length > 255
      || !EMAIL_REGEX.test(email)
      || identifier.length > MAX_IDENTIFIER_LENGTH
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      )
    }

    const rateLimitKey = `${getClientIp(request)}:${siteId}:email-form`
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
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

    const result = await upsertSystemNewsletterContact({
      siteId,
      email,
      source: EMAIL_FORM_CONTACT_SOURCE,
      tags: [EMAIL_FORM_CONTACT_TAG, identifier].filter(Boolean),
      extraMetadata: {
        ...(identifier ? { email_form_identifier: identifier } : {}),
        ...(blockId ? { page_hero_block_id: blockId } : {}),
        last_email_form_signup_at: new Date().toISOString(),
      },
    })

    if (result.error) {
      return NextResponse.json(
        { success: false, error: 'Failed to subscribe' },
        { status: 500 }
      )
    }

    try {
      const emailConfig = await getEmailConfig(siteId)
      if (emailConfig?.apiKey && emailConfig.fromEmail) {
        const template = await getSystemEmailTemplate('pages_hero_email', siteId)
        if (template.is_enabled) {
          const pagesHeroContent = blockId
            ? sanitizeRichMediaHtml(await getPagesHeroContent(siteId, blockId)).trim()
            : ''
          const tokens = await buildSystemEmailTokens({
            siteId,
            subscriberEmail: email,
            emailFormIdentifier: identifier,
            pagesHeroContent,
          })
          const provider = getEmailProvider(emailConfig.apiKey, emailConfig.providerType)
          const fromName = template.from_name || emailConfig.fromName || site.name || 'Your Company'

          const sendResult = await provider.send({
            from: `${fromName} <${emailConfig.fromEmail}>`,
            to: email,
            subject: renderSystemEmailSubject(template.subject, tokens),
            html: renderSystemEmailContent(template, tokens),
            replyTo: template.reply_to || undefined,
          })

          if (!sendResult.success) {
            console.error('Pages hero email send failed:', sendResult.error)
          }
        }
      }
    } catch (error) {
      console.error('Pages hero email error:', error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Newsletter subscribe error:', error)
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}
