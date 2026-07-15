import 'server-only'

import { createHash } from 'node:crypto'
import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { Agent } from 'undici'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteAutomationSourceStates } from '@/lib/db/schema'
import type { ScrapedDocument, ScraperAutomationNode } from '@/features/automations/domain/types'
import { RetryableAutomationError } from '../errors'
import {
  isBlockedAutomationAddress,
  isBlockedAutomationHostname,
  normalizeHostname,
} from './network-policy'

const FETCH_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_DOCUMENT_CHARS = 40_000

export interface ScraperNodeResult {
  documents: ScrapedDocument[]
  fetchedCount: number
  unchangedCount: number
}

export async function runScraperNode(
  automationId: string,
  node: ScraperAutomationNode
): Promise<ScraperNodeResult> {
  const urls = node.config.urls.map((url) => url.trim()).filter(Boolean)
  const previous = await db
    .select()
    .from(siteAutomationSourceStates)
    .where(and(
      eq(siteAutomationSourceStates.automationId, automationId),
      eq(siteAutomationSourceStates.nodeId, node.id),
    ))
  const previousByUrlHash = new Map(previous.map((item) => [item.urlHash, item]))
  const fetched = await Promise.all(urls.map(fetchPublicPage))
  const changed = fetched.filter((document) => previousByUrlHash.get(hash(document.url))?.contentHash !== document.contentHash)
  const now = new Date()

  await db.transaction(async (tx) => {
    for (const document of fetched) {
      const urlHash = hash(document.url)
      const old = previousByUrlHash.get(urlHash)
      await tx
        .insert(siteAutomationSourceStates)
        .values({
          automationId,
          nodeId: node.id,
          url: document.url,
          urlHash,
          contentHash: document.contentHash,
          lastChangedAt: old?.contentHash === document.contentHash ? old.lastChangedAt : now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [
            siteAutomationSourceStates.automationId,
            siteAutomationSourceStates.nodeId,
            siteAutomationSourceStates.urlHash,
          ],
          set: {
            url: document.url,
            contentHash: document.contentHash,
            lastChangedAt: old?.contentHash === document.contentHash ? old.lastChangedAt : now,
            lastSeenAt: now,
          },
        })
    }
  })

  return { documents: changed, fetchedCount: fetched.length, unchangedCount: fetched.length - changed.length }
}

async function fetchPublicPage(rawUrl: string): Promise<ScrapedDocument> {
  const { url, addresses } = await resolveSafeUrl(rawUrl)
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
          Accept: 'text/html,text/plain,text/markdown,application/json,application/xml,text/xml,*/*;q=0.2',
          'User-Agent': 'HubAutomationBot/2.0',
        },
      } as RequestInit & { dispatcher: Agent })
    } catch (error) {
      throw new RetryableAutomationError(error instanceof Error && error.name === 'AbortError'
        ? 'Website request timed out'
        : 'Website could not be reached')
    }

    if (response.status >= 300 && response.status < 400) throw new Error('Website redirects are not allowed')
    if (!response.ok) {
      const message = `Website returned HTTP ${response.status}`
      if (response.status === 408 || response.status === 429 || response.status >= 500) throw new RetryableAutomationError(message)
      throw new Error(message)
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || 'text/plain'
    if (!isAllowedContentType(contentType)) throw new Error('Website content type is not supported')
    const body = await readLimitedText(response)
    const title = contentType === 'text/html' ? extractTitle(body) : url.hostname
    const text = contentType === 'text/html' ? extractTextFromHtml(body) : normalizeWhitespace(body)
    if (!text) throw new Error('No readable text was found on the website')
    const limited = text.length > MAX_DOCUMENT_CHARS ? `${text.slice(0, MAX_DOCUMENT_CHARS)}\n[Page truncated]` : text
    return { url: url.href, title, text: limited, contentHash: hash(limited) }
  } finally {
    clearTimeout(timeout)
    await dispatcher.close().catch(() => {})
  }
}

async function resolveSafeUrl(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Website URL is invalid')
  }
  if (url.protocol !== 'https:') throw new Error('Website URL must use HTTPS')
  if (url.username || url.password) throw new Error('Website URL cannot include credentials')
  if (!url.hostname || isBlockedAutomationHostname(url.hostname)) throw new Error('Website host is not allowed')

  let addresses: LookupAddress[]
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true })
  } catch {
    throw new RetryableAutomationError('Website host could not be resolved')
  }
  if (!addresses.length) throw new RetryableAutomationError('Website host could not be resolved')
  if (addresses.some((entry) => isBlockedAutomationAddress(entry.address))) {
    throw new Error('Website cannot resolve to a private or reserved address')
  }
  return { url, addresses }
}

function createPinnedDispatcher(hostname: string, addresses: LookupAddress[]) {
  const normalizedHostname = normalizeHostname(hostname)
  return new Agent({
    connect: {
      lookup(requestedHostname, options, callback) {
        if (normalizeHostname(requestedHostname) !== normalizedHostname) {
          callback(new Error('Website host changed during fetch'), '', 0)
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

async function readLimitedText(response: Response) {
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
      throw new Error('Website response is too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function extractTitle(html: string) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return normalizeWhitespace(decodeEntities(match?.[1] || '')) || 'Untitled page'
}

function extractTextFromHtml(html: string) {
  return normalizeWhitespace(decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')))
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code)
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
    })
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function isAllowedContentType(value: string) {
  return value.startsWith('text/') || value === 'application/json' || value === 'application/xml' || value === 'application/rss+xml' || value === 'application/atom+xml'
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
