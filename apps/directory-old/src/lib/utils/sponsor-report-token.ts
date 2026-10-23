
import { createHash, randomBytes } from 'crypto'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** Generate a random sponsor report token (returned once, stored only as a hash) */
export function generateSponsorReportToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSponsorReportToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isValidSponsorReportTokenFormat(token: string | undefined | null): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}
