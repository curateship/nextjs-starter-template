import { createHmac, timingSafeEqual } from 'crypto'

const TOKEN_VERSION = 'v1'
const TOKEN_TTL_MS = 30 * 60 * 1000

type ContactTokenPayload = {
  v: typeof TOKEN_VERSION
  siteId: string
  email: string
  exp: number
}

function getSigningKey() {
  const key = process.env.AUTH_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY
  if (!key) throw new Error('Missing guided form contact token signing key')
  return key
}

function encodePayload(payload: ContactTokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getSigningKey()).update(encodedPayload).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function generateGuidedFormContactToken(input: {
  siteId: string
  email: string
}) {
  const payload: ContactTokenPayload = {
    v: TOKEN_VERSION,
    siteId: input.siteId,
    email: input.email.trim().toLowerCase(),
    exp: Date.now() + TOKEN_TTL_MS,
  }
  const encodedPayload = encodePayload(payload)
  return `${encodedPayload}.${signPayload(encodedPayload)}`
}

export function verifyGuidedFormContactToken(input: {
  siteId: string
  email: string
  token?: string | null
}): { ok: true; email: string } | { ok: false } {
  const tokenParts = (input.token || '').split('.')
  if (tokenParts.length !== 2) return { ok: false }

  const [encodedPayload, signature] = tokenParts
  if (!encodedPayload || !signature) return { ok: false }

  const expectedSignature = signPayload(encodedPayload)
  if (!safeEqual(signature, expectedSignature)) return { ok: false }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<ContactTokenPayload>
    const email = input.email.trim().toLowerCase()
    if (
      payload.v !== TOKEN_VERSION
      || payload.siteId !== input.siteId
      || payload.email !== email
      || typeof payload.exp !== 'number'
      || payload.exp < Date.now()
    ) {
      return { ok: false }
    }

    return { ok: true, email }
  } catch {
    return { ok: false }
  }
}
