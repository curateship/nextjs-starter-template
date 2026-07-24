import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { siteAutomationSourceStates } from '@/lib/db/schema'
import type { FeedAutomationNode, ScrapedDocument } from '@/features/automations/domain/types'
import { fetchPublicResource } from './safe-fetch'
import { parseFeed, type ParsedFeedEntry } from './feed-parse'

const FEED_ACCEPT = 'application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5'
const MAX_ENTRY_CHARS = 10_000

export interface FeedNodeResult {
  documents: ScrapedDocument[]
  fetchedCount: number
  unchangedCount: number
}

// Reads one or more RSS/Atom feeds and emits only entries not seen on a prior
// run. Each entry's identity (feed URL + guid/link/content) is recorded in
// site_automation_source_states, so an immediate re-run emits nothing until the
// feed publishes something new.
export async function runFeedNode(automationId: string, node: FeedAutomationNode): Promise<FeedNodeResult> {
  const urls = node.config.urls.map((url) => url.trim()).filter(Boolean)
  // Parse every feed up front; a feed that fails to fetch or parse fails the
  // node with a clear message rather than silently dropping entries.
  const parsed = await Promise.all(urls.map(fetchAndParseFeed))

  // Flatten to candidate documents keyed by a stable dedup hash, collapsing an
  // entry a feed happens to list twice within one run.
  const candidates = new Map<string, ScrapedDocument>()
  for (const { feedUrl, entries } of parsed) {
    for (const entry of entries) {
      const key = dedupHash(feedUrl, entry)
      if (!candidates.has(key)) candidates.set(key, toDocument(feedUrl, entry, key))
    }
  }

  const previous = await db
    .select({ urlHash: siteAutomationSourceStates.urlHash })
    .from(siteAutomationSourceStates)
    .where(and(
      eq(siteAutomationSourceStates.automationId, automationId),
      eq(siteAutomationSourceStates.nodeId, node.id),
    ))
  const seen = new Set(previous.map((row) => row.urlHash))
  const now = new Date()
  const fresh: ScrapedDocument[] = []

  await db.transaction(async (tx) => {
    for (const [key, document] of candidates) {
      if (!seen.has(key)) fresh.push(document)
      await tx
        .insert(siteAutomationSourceStates)
        .values({
          automationId,
          nodeId: node.id,
          url: document.url,
          urlHash: key,
          contentHash: document.contentHash,
          lastChangedAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [
            siteAutomationSourceStates.automationId,
            siteAutomationSourceStates.nodeId,
            siteAutomationSourceStates.urlHash,
          ],
          // An entry already processed on a prior run only has its lastSeenAt
          // advanced; it is never re-emitted.
          set: { url: document.url, lastSeenAt: now },
        })
    }
  })

  return { documents: fresh, fetchedCount: candidates.size, unchangedCount: candidates.size - fresh.length }
}

async function fetchAndParseFeed(feedUrl: string): Promise<{ feedUrl: string; entries: ParsedFeedEntry[] }> {
  const { url, body } = await fetchPublicResource(feedUrl, { accept: FEED_ACCEPT, resourceLabel: 'Feed' })
  try {
    return { feedUrl: url, entries: parseFeed(body, url).entries }
  } catch {
    throw new Error(`Feed at ${safeHost(url)} is not valid RSS or Atom`)
  }
}

function dedupHash(feedUrl: string, entry: ParsedFeedEntry): string {
  // Namespace the identity by feed URL so guids that are only unique within a
  // feed (or reused across feeds) never collide.
  const basis = entry.id || `${entry.title}\u0000${entry.summary}`
  return hash(`${feedUrl}\u0000${basis}`)
}

function toDocument(feedUrl: string, entry: ParsedFeedEntry, key: string): ScrapedDocument {
  const url = entry.link || `${feedUrl}#${key.slice(0, 16)}`
  const text = composeText(entry)
  return { url, title: entry.title, text, contentHash: hash(text) }
}

function composeText(entry: ParsedFeedEntry): string {
  const parts = [entry.title]
  if (entry.publishedAt) parts.push(`Published: ${entry.publishedAt}`)
  if (entry.link) parts.push(`Source: ${entry.link}`)
  if (entry.summary) parts.push('', entry.summary)
  const text = parts.join('\n').trim()
  return text.length > MAX_ENTRY_CHARS ? `${text.slice(0, MAX_ENTRY_CHARS)}\n[Entry truncated]` : text
}

function safeHost(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return 'the feed'
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
