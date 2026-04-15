import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { Pool } from 'pg'
import * as bcrypt from 'bcryptjs'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/email/system-email'
import { safeDecrypt } from '@/lib/utils/encryption'
import { getEmailProvider } from '@/lib/actions/email/provider'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
})

type VerificationEmailConfig = {
  apiKey: string
  fromEmail: string
  fromName?: string | null
  providerType: 'resend'
}

function normalizeRequestHost(request?: Request) {
  if (!request) {
    return ''
  }

  const headerHost =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(request.url).host

  const host = headerHost.split(',')[0]?.trim().toLowerCase() || ''
  return host.replace(/^www\./, '').replace(/:\d+$/, '')
}

async function getSiteVerificationEmailConfig(request?: Request): Promise<VerificationEmailConfig | null> {
  const host = normalizeRequestHost(request)

  if (!host) {
    return null
  }

  const siteByDomain = await pool.query<{
    id: string
    name: string
    status: string
  }>(
    `
      select id, name, status
      from sites
      where custom_domain = $1
      limit 1
    `,
    [host]
  )

  const allowedStatuses = new Set(['active', 'draft'])
  const reservedSubdomains = new Set(['www', 'api', 'admin', 'app'])

  let site = siteByDomain.rows[0]

  if (!site && host.includes('.')) {
    const subdomain = host.split('.')[0]
    if (subdomain && !reservedSubdomains.has(subdomain)) {
      const siteBySubdomain = await pool.query<{
        id: string
        name: string
        status: string
      }>(
        `
          select id, name, status
          from sites
          where subdomain = $1
          limit 1
        `,
        [subdomain]
      )

      site = siteBySubdomain.rows[0]
    }
  }

  if (!site || !allowedStatuses.has(site.status)) {
    return null
  }

  const integrationResult = await pool.query<{
    config: Record<string, unknown> | null
  }>(
    `
      select config
      from site_integrations
      where site_id = $1
        and integration_type = 'resend'
        and is_enabled = true
      limit 1
    `,
    [site.id]
  )

  const config = integrationResult.rows[0]?.config

  if (!config || typeof config !== 'object') {
    return null
  }

  const apiKey = typeof config.api_key === 'string' ? safeDecrypt(config.api_key) : ''
  const fromEmail =
    typeof config.from_email === 'string' && config.from_email.length > 0
      ? config.from_email
      : process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || ''
  const fromName =
    typeof config.from_name === 'string' && config.from_name.length > 0
      ? config.from_name
      : site.name

  if (!apiKey || !fromEmail) {
    return null
  }

  return {
    apiKey,
    fromEmail,
    fromName,
    providerType: 'resend',
  }
}

async function getVerificationEmailConfig(request?: Request): Promise<VerificationEmailConfig | null> {
  const siteConfig = await getSiteVerificationEmailConfig(request)

  if (siteConfig) {
    return siteConfig
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL

  if (!apiKey || !fromEmail) {
    return null
  }

  return {
    apiKey,
    fromEmail,
    providerType: 'resend',
  }
}

async function sendAuthVerificationEmail(email: string, url: string, request?: Request) {
  const config = await getVerificationEmailConfig(request)

  if (!config) {
    throw new Error('Email verification requires a configured Resend sender')
  }

  const template = await getSystemEmailTemplate('email_verification')
  const tokens = await buildSystemEmailTokens({
    verificationUrl: url,
  })
  const provider = getEmailProvider(config.apiKey, config.providerType)
  const result = await provider.send({
    from: config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail,
    to: email,
    subject: renderSystemEmailSubject(template.subject, tokens),
    html: renderSystemEmailContent(template, tokens),
    ...(template.reply_to ? { replyTo: template.reply_to } : {}),
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to send verification email')
  }
}

type SessionCacheVersionInput = {
  token?: string | null
}

type SessionCacheVersionUser = {
  id?: string | null
}

export async function getSessionCookieCacheVersion(
  session: SessionCacheVersionInput,
  user: SessionCacheVersionUser
) {
  if (!session.token || !user.id) {
    return 'missing'
  }

  const result = await pool.query<{
    sessionUpdatedAt: string
    userUpdatedAt: string
    role: string | null
    banned: boolean | null
    banExpires: string | null
    name: string | null
    email: string | null
    displayName: string | null
  }>(
    `
      select
        s."updatedAt"::text as "sessionUpdatedAt",
        u."updatedAt"::text as "userUpdatedAt",
        u.role,
        u.banned,
        u."banExpires"::text as "banExpires",
        u.name,
        u.email,
        u."displayName"
      from user_sessions s
      join users u on u.id = s."userId"
      where s.token = $1
        and u.id = $2
      limit 1
    `,
    [session.token, user.id]
  )

  const row = result.rows[0]

  if (!row) {
    return 'revoked'
  }

  return JSON.stringify([
    row.sessionUpdatedAt,
    row.userUpdatedAt,
    row.role ?? '',
    row.banned ? '1' : '0',
    row.banExpires ?? '',
    row.name ?? '',
    row.email ?? '',
    row.displayName ?? '',
  ])
}

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    requireEmailVerification: true,
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 10)
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash)
      },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }, request) {
      await sendAuthVerificationEmail(user.email, url, request)
    },
  },
  account: {
    modelName: 'user_auth_paths',
  },
  verification: {
    modelName: 'user_verifications',
  },
  session: {
    modelName: 'user_sessions',
    cookieCache: {
      enabled: true,
      maxAge: 7 * 24 * 60 * 60, // 7 days
      version: getSessionCookieCacheVersion,
    },
  },
  user: {
    modelName: 'users',
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'end_user',
        input: false,
      },
      displayName: {
        type: 'string',
        required: false,
        input: true,
        fieldName: 'displayName',
      },
    },
  },
  plugins: [admin()],
})

export type Session = typeof auth.$Infer.Session
