import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { getEmailConfig } from '@/lib/actions/email/integration-actions'
import { getEmailProvider } from '@/lib/actions/email/provider'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/email/system-email'
import {
  EMAIL_FORM_CONTACT_SOURCE,
  EMAIL_FORM_CONTACT_TAG,
  upsertSystemNewsletterContact,
} from '@/lib/newsletters/system-contact-sync'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const MAX_IDENTIFIER_LENGTH = 100
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const identifier = typeof body?.identifier === 'string'
      ? body.identifier.trim().replace(/\s+/g, ' ')
      : ''

    if (
      !UUID_REGEX.test(siteId)
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
        settings: sites.settings,
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
        last_email_form_signup_at: new Date().toISOString(),
      },
    })

    if (result.error) {
      return NextResponse.json(
        { success: false, error: 'Failed to subscribe' },
        { status: 500 }
      )
    }

    const siteSettings = (site.settings || {}) as Record<string, any>
    if (siteSettings.welcome_email_enabled !== false) {
      try {
        const emailConfig = await getEmailConfig(siteId)
        if (emailConfig?.apiKey && emailConfig.fromEmail) {
          const template = await getSystemEmailTemplate('welcome_email', siteId)
          if (template.is_enabled) {
            const tokens = await buildSystemEmailTokens({
              siteId,
              subscriberEmail: email,
              emailFormIdentifier: identifier,
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
              console.error('Welcome email send failed:', sendResult.error)
            }
          }
        }
      } catch (error) {
        console.error('Welcome email error:', error)
      }
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
