import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { UUID_REGEX } from '@/lib/utils/validation'

export function isAuthorizedCoreBridgeRequest(request: NextRequest): boolean {
  const expectedToken = process.env.HUB_CORE_BRIDGE_TOKEN?.trim()
  const authHeader = request.headers.get('authorization') || ''
  const prefix = 'Bearer '

  if (!expectedToken || !authHeader.startsWith(prefix)) return false

  const token = authHeader.slice(prefix.length).trim()
  const tokenBuffer = Buffer.from(token)
  const expectedBuffer = Buffer.from(expectedToken)
  if (!token || tokenBuffer.length !== expectedBuffer.length) return false

  return timingSafeEqual(tokenBuffer, expectedBuffer)
}

export function getCoreBridgeAllowedSiteIds(): Set<string> | null {
  const rawValue = process.env.HUB_CORE_BRIDGE_SITE_IDS?.trim()
  if (!rawValue) return null

  const siteIds = rawValue
    .split(',')
    .map((siteId) => siteId.trim())
    .filter((siteId) => UUID_REGEX.test(siteId))

  return new Set(siteIds)
}

export function isCoreBridgeSiteAllowed(siteId: string): boolean {
  const allowedSiteIds = getCoreBridgeAllowedSiteIds()
  return !allowedSiteIds || allowedSiteIds.has(siteId)
}
