
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { MemoryRateLimiter } from '@/lib/utils/memory-rate-limiter'

const memoryRateLimiter = new MemoryRateLimiter()

export function isRateLimited(key: string, limit: number, windowMs: number) {
  return memoryRateLimiter.isLimited(key, limit, windowMs)
}

function getConfiguredClientIpHeader() {
  return process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase() || ''
}

function getHeaderIp(headers: Headers, headerName: string) {
  const value = headers.get(headerName)
  if (!value) return null

  const parts = value.split(',').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] || null
}

export function getClientIp(headers: Headers) {
  const configuredHeader = getConfiguredClientIpHeader()
  if (configuredHeader) {
    return getHeaderIp(headers, configuredHeader)
  }

  return getHeaderIp(headers, 'cf-connecting-ip') || getHeaderIp(headers, 'true-client-ip')
}

export async function isPersistentRateLimited(key: string, limit: number, windowMs: number) {
  const resetAt = new Date(Date.now() + windowMs)
  const result = await db.execute<{ count: number | string }>(sql`
    with expired as (
      delete from rate_limit_buckets
      where rate_key in (
        select rate_key
        from rate_limit_buckets
        where reset_at <= now()
          and rate_key <> ${key}
        order by reset_at
        limit 500
      )
    )
    insert into rate_limit_buckets (rate_key, count, reset_at, updated_at)
    values (${key}, 1, ${resetAt}, now())
    on conflict (rate_key) do update set
      count = case
        when rate_limit_buckets.reset_at <= now() then 1
        else rate_limit_buckets.count + 1
      end,
      reset_at = case
        when rate_limit_buckets.reset_at <= now() then ${resetAt}
        else rate_limit_buckets.reset_at
      end,
      updated_at = now()
    returning count
  `)

  return Number(result.rows[0]?.count || 0) > limit
}
