import { betterAuth } from 'better-auth'
import { admin, magicLink, oAuthProxy } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Pool } from 'pg'
import * as bcrypt from 'bcryptjs'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
  type SystemEmailTemplateKey,
} from '@/lib/actions/email/system-email'
import {
  SITE_REGISTRATION_CONTACT_SOURCE,
  SITE_REGISTRATION_CONTACT_TAG,
  upsertSystemNewsletterContact,
} from '@/lib/actions/newsletters/system-contact-sync'
import { upsertSiteMembership } from '@/lib/utils/site-membership-runtime'
import { safeDecrypt } from '@/lib/utils/encryption'
import { getEmailProvider } from '@/lib/actions/email/provider'
import { getHubPlatformOrigin, isReservedPlatformSubdomain } from '@/lib/utils/platform-host'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
})

type VerificationEmailConfig = {
  apiKey: string
  fromEmail: string
  fromName?: string | null
  providerType: 'resend'
}

type AuthEmailTemplateKey = Extract<
  SystemEmailTemplateKey,
  'email_verification' | 'email_change_confirmation' | 'magic_link'
>

type ResolvedRequestSite = {
  id: string
  name: string
  status: string
}

type AuthRequestContext = {
  path?: string | null
  request?: Request | null
  headers?: Headers | null
}

function normalizeRequestHost(source?: Request | AuthRequestContext) {
  const request = source instanceof Request ? source : source?.request
  const headers = source instanceof Request ? source.headers : source?.headers

  if (!request && !headers) {
    return ''
  }

  const headerHost =
    headers?.get('x-forwarded-host') ||
    headers?.get('host') ||
    (request ? new URL(request.url).host : '')

  const host = headerHost.split(',')[0]?.trim().toLowerCase() || ''
  return host.replace(/^www\./, '').replace(/:\d+$/, '')
}

async function getSiteVerificationEmailConfig(request?: Request): Promise<VerificationEmailConfig | null> {
  const site = await resolveSiteFromRequest(request)

  if (!site) {
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

async function resolveSiteFromRequest(source?: Request | AuthRequestContext): Promise<ResolvedRequestSite | null> {
  const host = normalizeRequestHost(source)

  if (!host) {
    return null
  }

  const siteByDomain = await pool.query<ResolvedRequestSite>(
    `
      select id, name, status
      from sites
      where custom_domain = $1
      limit 1
    `,
    [host]
  )

  const allowedStatuses = new Set(['active', 'draft'])
  let site = siteByDomain.rows[0]

  if (!site && host.includes('.')) {
    const subdomain = host.split('.')[0]
    if (subdomain && !isReservedPlatformSubdomain(subdomain)) {
      const siteBySubdomain = await pool.query<ResolvedRequestSite>(
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

  return site
}

function normalizeTrustedOrigin(value?: string | null) {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getConfiguredTrustedOrigins() {
  const values = [
    process.env.BETTER_AUTH_URL,
    import.meta.env.VITE_APP_URL,
    import.meta.env.VITE_DIRECTORY_ORIGIN,
    process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    getHubPlatformOrigin(),
  ]

  const origins = new Set<string>()
  for (const value of values as Array<string | undefined>) {
    value?.split(',').forEach((entry) => {
      const origin = normalizeTrustedOrigin(entry.trim())
      if (origin) origins.add(origin)
    })
  }

  return origins
}

async function getTrustedOrigins(request?: Request) {
  const origins = getConfiguredTrustedOrigins()

  if (!request) {
    return Array.from(origins)
  }

  const requestOrigin = normalizeTrustedOrigin(request.headers.get('origin'))
  if (!requestOrigin) {
    return Array.from(origins)
  }

  const originHost = normalizeRequestHost({ headers: new Headers({ host: new URL(requestOrigin).host }) })
  const requestHost = normalizeRequestHost(request)
  if (!originHost || originHost !== requestHost) {
    return Array.from(origins)
  }

  const site = await resolveSiteFromRequest(request)
  if (site) {
    origins.add(requestOrigin)
  }

  return Array.from(origins)
}

function splitContactName(name?: string | null) {
  const normalizedName = name?.trim()

  if (!normalizedName) {
    return { firstName: undefined, lastName: undefined }
  }

  const [firstName, ...rest] = normalizedName.split(/\s+/)

  return {
    firstName,
    lastName: rest.length ? rest.join(' ') : undefined,
  }
}

async function syncSiteRegistrationContact(
  user: {
    id?: string | null
    email?: string | null
    name?: string | null
    displayName?: string | null
  },
  requestContext?: Request | AuthRequestContext
) {
  if (!user.email) {
    return
  }

  const site = await resolveSiteFromRequest(requestContext)

  if (!site) {
    return
  }

  const { firstName, lastName } = splitContactName(user.displayName || user.name)

  const result = await upsertSystemNewsletterContact({
    siteId: site.id,
    email: user.email,
    source: SITE_REGISTRATION_CONTACT_SOURCE,
    preserveExistingSource: true,
    firstName,
    lastName,
    tags: [SITE_REGISTRATION_CONTACT_TAG],
  })

  if (result.error) {
    throw new Error(result.error)
  }

  if (user.id) {
    await upsertSiteMembership({
      siteId: site.id,
      userId: user.id,
      role: 'member',
      status: 'active',
      lastEngagedAt: new Date(),
    })
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

async function sendAuthSystemEmail({
  to,
  request,
  templateKey,
  tokens,
  configError,
  deliveryError,
}: {
  to: string
  request?: Request
  templateKey: AuthEmailTemplateKey
  tokens: Record<string, string>
  configError: string
  deliveryError: string
}) {
  const config = await getVerificationEmailConfig(request)

  if (!config) {
    throw new Error(configError)
  }

  const template = await getSystemEmailTemplate(templateKey)
  const fromName = template.from_name || config.fromName
  const provider = getEmailProvider(config.apiKey, config.providerType)
  const result = await provider.send({
    from: fromName ? `${fromName} <${config.fromEmail}>` : config.fromEmail,
    to,
    subject: renderSystemEmailSubject(template.subject, tokens),
    html: renderSystemEmailContent(template, tokens),
    ...(template.reply_to ? { replyTo: template.reply_to } : {}),
  })

  if (!result.success) {
    throw new Error(result.error || deliveryError)
  }
}

async function sendAuthVerificationEmail(email: string, url: string, request?: Request) {
  await sendAuthSystemEmail({
    to: email,
    request,
    templateKey: 'email_verification',
    tokens: await buildSystemEmailTokens({
      verificationUrl: url,
    }),
    configError: 'Email verification requires a configured Resend sender',
    deliveryError: 'Failed to send verification email',
  })
}

// Dev only: baseURL is pinned to the local origin (VITE_DIRECTORY_ORIGIN), so
// rewrite the console link's host to the tenant host that made the request. The
// verify response then sets the session cookie on that same host.
function rewriteMagicLinkHostForDev(url: string, request?: Request) {
  const hostHeader = request?.headers.get('x-forwarded-host') || request?.headers.get('host')
  if (!hostHeader) return url

  try {
    const parsed = new URL(url)
    parsed.host = hostHeader.split(',')[0].trim()
    return parsed.toString()
  } catch {
    return url
  }
}

async function sendAuthMagicLinkEmail(email: string, url: string, request?: Request) {
  await sendAuthSystemEmail({
    to: email,
    request,
    templateKey: 'magic_link',
    tokens: await buildSystemEmailTokens({
      magicLinkUrl: url,
    }),
    configError: 'Magic-link sign-in requires a configured Resend sender',
    deliveryError: 'Failed to send magic-link email',
  })
}

async function sendAuthChangeEmailConfirmation(email: string, newEmail: string, url: string, request?: Request) {
  await sendAuthSystemEmail({
    to: email,
    request,
    templateKey: 'email_change_confirmation',
    tokens: await buildSystemEmailTokens({
      confirmationUrl: url,
      currentEmail: email,
      newEmail,
    }),
    configError: 'Email change confirmation requires a configured Resend sender',
    deliveryError: 'Failed to send email change confirmation',
  })
}

type SessionCacheVersionInput = {
  token?: string | null
}

type SessionCacheVersionUser = {
  id?: string | null
}

async function getSessionCookieCacheVersion(
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
    image: string | null
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
        u."displayName",
        u.image
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
    row.image ?? '',
  ])
}

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

/**
 * Google sign-in stays dormant until a platform-level Google OAuth app is
 * configured. Both env vars must be present for the provider to register and
 * for the "Continue with Google" button to appear on the login block.
 */
export function isGoogleAuthEnabled() {
  return Boolean(googleClientId && googleClientSecret)
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || import.meta.env.VITE_APP_URL || import.meta.env.VITE_DIRECTORY_ORIGIN,
  database: pool,
  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }
    : {}),
  trustedOrigins: getTrustedOrigins,
  databaseHooks: {
    user: {
      create: {
        async after(user, context) {
          try {
            await syncSiteRegistrationContact({
              id: user.id,
              email: user.email,
              name: user.name,
              displayName: typeof user.displayName === 'string' ? user.displayName : null,
            }, context || undefined)
          } catch (error) {
            console.error('Failed to sync signup contact:', error)
          }
        },
      },
    },
  },
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
    accountLinking: {
      enabled: true,
      // Google verifies email ownership, so a Google sign-in on an address that
      // already has a password account links into that same user instead of
      // creating a duplicate.
      trustedProviders: ['google'],
    },
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
    changeEmail: {
      enabled: true,
      async sendChangeEmailConfirmation({ user, newEmail, url }, request) {
        await sendAuthChangeEmailConfirmation(user.email, newEmail, url, request)
      },
    },
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
  plugins: [
    admin(),
    magicLink({
      // Deliver the sign-in link through the same per-site Resend sender that
      // powers email verification, so each tenant keeps its own from-address.
      async sendMagicLink({ email, url }, ctx) {
        try {
          await sendAuthMagicLinkEmail(email, url, ctx?.request)
        } catch (error) {
          // Local dev without a configured email sender: print the link to the
          // server console instead of failing, mirroring the password-reset
          // route's dev fallback. The URL never leaves the server. The send
          // error is included so a real misconfiguration (bad key, unverified
          // domain) is visible rather than silently masked.
          if (process.env.NODE_ENV !== 'production') {
            const reason = error instanceof Error ? error.message : 'unknown error'
            const devUrl = rewriteMagicLinkHostForDev(url, ctx?.request)
            console.info(`[magic-link] Email delivery failed (${reason}); sign-in link for ${email}: ${devUrl}`)
            return
          }
          throw error
        }
      },
    }),
    // Every tenant host shares one Google app: the OAuth proxy sends Google to a
    // single registered callback on the platform origin, then bounces the signed
    // session back to whichever tenant host started the flow.
    ...(googleClientId && googleClientSecret
      ? [
          oAuthProxy({
            productionURL:
              process.env.OAUTH_PROXY_PRODUCTION_URL ||
              process.env.BETTER_AUTH_URL ||
              getHubPlatformOrigin(),
          }),
        ]
      : []),
    // The cookie plugin must stay last so it wraps every other plugin's response.
    tanstackStartCookies(),
  ],
})
