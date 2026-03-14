import { createHmac } from 'crypto'

function getKey(): string {
  return process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
}

/** Generate HMAC token for unsubscribe links */
export function generateUnsubscribeToken(siteId: string, email: string): string {
  return createHmac('sha256', getKey()).update(`${siteId}:${email.toLowerCase()}`).digest('hex')
}

/** Verify HMAC token for unsubscribe requests */
export function verifyUnsubscribeToken(siteId: string, email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(siteId, email)
  return token === expected
}
