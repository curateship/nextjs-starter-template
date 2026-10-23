import { createHmac, timingSafeEqual } from 'crypto'

function getSigningKey() {
  return process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY
}

export function signTrackedRedirect(token: string, redirectUrl: string) {
  const key = getSigningKey()
  if (!key) throw new Error('Missing signing key')

  return createHmac('sha256', key)
    .update(`${token}:${redirectUrl}`)
    .digest('hex')
}

export function verifyTrackedRedirect(token: string, redirectUrl: string, signature?: string | null) {
  if (!signature) return false

  const expected = signTrackedRedirect(token, redirectUrl)
  if (signature.length !== expected.length) return false

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
