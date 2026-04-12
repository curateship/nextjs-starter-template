import { randomBytes } from 'crypto'
import { sql } from 'drizzle-orm'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/email/system-email'

const DEFAULT_REDIRECT_PATH = '/login/reset-password'
const VERIFICATION_TABLE = 'user_verifications'
const GENERIC_RESPONSE = {
  status: true,
  message: 'If this email exists in our system, check your email for the reset link',
}

function getBaseUrl(request: Request) {
  return process.env.BETTER_AUTH_URL || new URL(request.url).origin
}

function getSafeRedirectPath(redirectTo?: unknown) {
  if (typeof redirectTo !== 'string' || !redirectTo.startsWith('/')) {
    return DEFAULT_REDIRECT_PATH
  }

  return redirectTo
}

function isAllowedOrigin(request: Request, baseUrl: string) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    return new URL(origin).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

function isLocalRequest(baseUrl: string) {
  try {
    const { hostname } = new URL(baseUrl)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

async function sendResetEmail(email: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) return false

  const template = await getSystemEmailTemplate('password_reset')
  const tokens = await buildSystemEmailTokens({
    templateKey: 'password_reset',
    resetUrl,
  })
  const subject = renderSystemEmailSubject(template.subject, tokens)
  const html = renderSystemEmailContent(template, tokens)
  const text = `Reset your password: ${resetUrl}`

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: template.from_name ? `${template.from_name} <${from}>` : from,
    to: email,
    subject,
    text,
    html,
    ...(template.reply_to ? { replyTo: template.reply_to } : {}),
  })

  return true
}

export async function POST(request: Request) {
  const baseUrl = getBaseUrl(request)

  if (!isAllowedOrigin(request, baseUrl)) {
    return Response.json({ error: 'Invalid origin' }, { status: 403 })
  }

  let body: { email?: unknown; redirectTo?: unknown } = {}

  try {
    body = await request.json()
  } catch {
    return Response.json(GENERIC_RESPONSE)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const redirectPath = getSafeRedirectPath(body.redirectTo)

  if (!email || !email.includes('@')) {
    return Response.json(GENERIC_RESPONSE)
  }

  const userResult = await db.execute<{ id: string; email: string }>(sql`
    select id, email
    from users
    where lower(email) = lower(${email})
    limit 1
  `)

  const user = userResult.rows[0]

  if (!user) {
    randomBytes(24).toString('hex')
    await db.execute(sql`
      select id
      from ${sql.raw(VERIFICATION_TABLE)}
      where identifier = 'dummy-verification-token'
      limit 1
    `)
    return Response.json(GENERIC_RESPONSE)
  }

  const token = randomBytes(24).toString('hex')
  const resetUrl = new URL(redirectPath, baseUrl)
  resetUrl.searchParams.set('token', token)

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  await db.execute(sql`
    insert into ${sql.raw(VERIFICATION_TABLE)} (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
    values (
      ${randomBytes(16).toString('hex')},
      ${`reset-password:${token}`},
      ${user.id},
      ${expiresAt},
      now(),
      now()
    )
  `)

  const emailSent = await sendResetEmail(user.email, resetUrl.toString())

  if (!emailSent && isLocalRequest(baseUrl)) {
    return Response.json({
      ...GENERIC_RESPONSE,
      resetUrl: resetUrl.toString(),
    })
  }

  return Response.json(GENERIC_RESPONSE)
}
