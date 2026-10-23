
import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteAutomationSourceStates } from '@/lib/db/schema'
import type { ScrapedDocument, ScraperAutomationNode } from '@/features/automations/domain/types'
import { fetchPublicResource } from './safe-fetch'

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
  const { url, contentType, body } = await fetchPublicResource(rawUrl)
  const title = contentType === 'text/html' ? extractTitle(body) : new URL(url).hostname
  const text = contentType === 'text/html' ? extractTextFromHtml(body) : normalizeWhitespace(body)
  if (!text) throw new Error('No readable text was found on the website')
  const limited = text.length > MAX_DOCUMENT_CHARS ? `${text.slice(0, MAX_DOCUMENT_CHARS)}\n[Page truncated]` : text
  return { url, title, text: limited, contentHash: hash(limited) }
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

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
