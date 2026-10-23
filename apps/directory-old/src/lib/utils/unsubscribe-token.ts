import { createHmac, timingSafeEqual } from 'crypto'

function getKey(): string {
  return process.env.INTEGRATION_ENCRYPTION_KEY || process.env.AUTH_SECRET!
}

/** Generate HMAC token for unsubscribe links */
export function generateUnsubscribeToken(siteId: string, email: string): string {
  return createHmac('sha256', getKey()).update(`${siteId}:${email.toLowerCase()}`).digest('hex')
}

/** Verify HMAC token for unsubscribe requests (timing-safe) */
export function verifyUnsubscribeToken(siteId: string, email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(siteId, email)
  if (token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}
