import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { Agent } from 'undici'
import { RetryableAutomationError } from '../errors'
import {
  isBlockedAutomationAddress,
  isBlockedAutomationHostname,
  normalizeHostname,
} from './network-policy'

// Shared, SSRF-hardened fetch for automation source nodes (Scraper, RSS Feed).
// Every source node that fetches a user-supplied URL server-side must go through
// here so the protections stay in one place: HTTPS only, no credentials, pinned
// DNS so the host cannot rebind to a private address mid-fetch, redirects
// refused, and a hard response-size ceiling.

const FETCH_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1024 * 1024
const DEFAULT_ACCEPT = 'text/html,text/plain,text/markdown,application/json,application/xml,text/xml,*/*;q=0.2'

export interface FetchedResource {
  url: string
  contentType: string
  body: string
}

export interface SafeFetchOptions {
  // Preferred response formats, sent as the Accept header.
  accept?: string
  // Noun used in user-facing error messages, so a Feed node reads "Feed ..."
  // and a Scraper node reads "Website ...".
  resourceLabel?: string
}

export async function fetchPublicResource(rawUrl: string, options: SafeFetchOptions = {}): Promise<FetchedResource> {
  const label = options.resourceLabel ?? 'Website'
  const { url, addresses } = await resolveSafeUrl(rawUrl, label)
  const dispatcher = createPinnedDispatcher(url.hostname, addresses)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetch(url.href, {
        redirect: 'manual',
        signal: controller.signal,
        dispatcher,
        headers: {
          Accept: options.accept ?? DEFAULT_ACCEPT,
          'User-Agent': 'HubAutomationBot/2.0',
        },
      } as RequestInit & { dispatcher: Agent })
    } catch (error) {
      throw new RetryableAutomationError(error instanceof Error && error.name === 'AbortError'
        ? `${label} request timed out`
        : `${label} could not be reached`)
    }

    if (response.status >= 300 && response.status < 400) throw new Error(`${label} redirects are not allowed`)
    if (!response.ok) {
      const message = `${label} returned HTTP ${response.status}`
      if (response.status === 408 || response.status === 429 || response.status >= 500) throw new RetryableAutomationError(message)
      throw new Error(message)
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || 'text/plain'
    if (!isAllowedContentType(contentType)) throw new Error(`${label} content type is not supported`)
    const body = await readLimitedText(response, label)
    return { url: url.href, contentType, body }
  } finally {
    clearTimeout(timeout)
    await dispatcher.close().catch(() => {})
  }
}

async function resolveSafeUrl(rawUrl: string, label: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`${label} URL is invalid`)
  }
  if (url.protocol !== 'https:') throw new Error(`${label} URL must use HTTPS`)
  if (url.username || url.password) throw new Error(`${label} URL cannot include credentials`)
  if (!url.hostname || isBlockedAutomationHostname(url.hostname)) throw new Error(`${label} host is not allowed`)

  let addresses: LookupAddress[]
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true })
  } catch {
    throw new RetryableAutomationError(`${label} host could not be resolved`)
  }
  if (!addresses.length) throw new RetryableAutomationError(`${label} host could not be resolved`)
  if (addresses.some((entry) => isBlockedAutomationAddress(entry.address))) {
    throw new Error(`${label} cannot resolve to a private or reserved address`)
  }
  return { url, addresses }
}

function createPinnedDispatcher(hostname: string, addresses: LookupAddress[]) {
  const normalizedHostname = normalizeHostname(hostname)
  return new Agent({
    connect: {
      lookup(requestedHostname, options, callback) {
        if (normalizeHostname(requestedHostname) !== normalizedHostname) {
          callback(new Error('Host changed during fetch'), '', 0)
          return
        }
        if (options?.all) {
          callback(null, addresses)
          return
        }
        const selected = addresses[0]
        callback(null, selected.address, selected.family)
      },
    },
  })
}

async function readLimitedText(response: Response, label: string) {
  const reader = response.body?.getReader()
  if (!reader) return response.text()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error(`${label} response is too large`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function isAllowedContentType(value: string) {
  return value.startsWith('text/') || value === 'application/json' || value === 'application/xml' || value === 'application/rss+xml' || value === 'application/atom+xml'
}
