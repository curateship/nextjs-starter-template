import { and, asc, desc, eq, inArray } from "drizzle-orm"

import {
  cleanWrittenPageBody,
  writtenPageText,
} from "@/lib/pages/written-page-body"
import { postBodyText } from "@/lib/posts/post-body"
import { db, type CustomShellDb } from "@/server/db"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"
import { newestEventsForFeed } from "@/server/events/public"
import { newestPostsForFeed } from "@/server/posts/public"

/** One small page is enough for readers without making every poll expensive. */
export const DIRECTORY_FEED_LIMIT = 20

export const DIRECTORY_FEED_CACHE_CONTROL =
  "public, max-age=120, stale-while-revalidate=120"

/**
 * A new listing, post or event. `path` is where it lives on the site. An
 * event is placed by the day it was published, not the day it happens, so the
 * feed stays "what is new on the site".
 */
export type DirectoryFeedEntry = {
  title: string
  path: string
  publishedAt: Date
  category: string | null
  description: string
}

function firstSentence(words: string): string {
  const text = words
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
  const sentenceEnd = text.search(/[.!?](?:\s|$)/)
  const sentence = sentenceEnd === -1 ? text : text.slice(0, sentenceEnd + 1)
  return sentence.length <= 300
    ? sentence
    : `${sentence.slice(0, 299).trimEnd()}…`
}

async function readDirectoryFeedUncached(
  siteId: string,
  database: CustomShellDb
): Promise<DirectoryFeedEntry[]> {
  const [listings, posts, events] = await Promise.all([
    database
      .select({
        id: directoryListings.id,
        title: directoryListings.title,
        slug: directoryListings.slug,
        metaDescription: directoryListings.metaDescription,
        body: directoryListings.body,
        createdAt: directoryListings.createdAt,
      })
      .from(directoryListings)
      .where(
        and(
          eq(directoryListings.workspaceId, siteId),
          eq(directoryListings.status, "published")
        )
      )
      .orderBy(desc(directoryListings.createdAt), asc(directoryListings.id))
      .limit(DIRECTORY_FEED_LIMIT),
    newestPostsForFeed(siteId, DIRECTORY_FEED_LIMIT, database),
    newestEventsForFeed(siteId, DIRECTORY_FEED_LIMIT, database),
  ])

  const categoryFor = new Map<string, string>()
  for (const row of await listingCategoryRows(
    siteId,
    listings.map((listing) => listing.id),
    database
  )) {
    if (!categoryFor.has(row.listingId)) {
      categoryFor.set(row.listingId, row.name)
    }
  }

  // Twenty of each were read, so the newest twenty of the three together are
  // all here, whichever kind they turn out to be.
  return [
    ...listings.map((listing) => ({
      title: listing.title,
      path: `/directory/${listing.slug}`,
      publishedAt: listing.createdAt,
      category: categoryFor.get(listing.id) ?? null,
      description:
        listing.metaDescription.trim() ||
        firstSentence(writtenPageText(cleanWrittenPageBody(listing.body))),
    })),
    ...posts.map((post) => ({
      title: post.title,
      path: `/posts/${post.slug}`,
      publishedAt: post.publishedAt,
      category: post.category?.name ?? null,
      description:
        post.summary.trim() || firstSentence(postBodyText(post.body)),
    })),
    ...events.map((event) => ({
      title: event.title,
      path: `/events/${event.slug}`,
      publishedAt: event.publishedAt,
      category: event.category,
      description:
        event.summary.trim() || firstSentence(postBodyText(event.body)),
    })),
  ]
    .sort(
      (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime()
    )
    .slice(0, DIRECTORY_FEED_LIMIT)
}

/** Each listing's categories, primary first, for the feed's category line. */
async function listingCategoryRows(
  siteId: string,
  listingIds: string[],
  database: CustomShellDb
) {
  if (listingIds.length === 0) return []
  return database
    .select({
      listingId: categoryRelationships.contentId,
      name: categories.name,
    })
    .from(categoryRelationships)
    .innerJoin(
      categories,
      and(
        eq(categories.id, categoryRelationships.categoryId),
        eq(categories.workspaceId, siteId)
      )
    )
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
        inArray(categoryRelationships.contentId, listingIds)
      )
    )
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))
}

/**
 * The newest published listings, posts and events on one site, held by the
 * public-page cache.
 */
export function readDirectoryFeed(
  siteId: string,
  database: CustomShellDb = db
): Promise<DirectoryFeedEntry[]> {
  return cachedPublicDirectoryRead(siteId, "feed", {}, () =>
    readDirectoryFeedUncached(siteId, database)
  )
}

function escapeXml(value: string): string {
  const clean = Array.from(value)
    .filter((character) => {
      const point = character.codePointAt(0) ?? 0
      return (
        point === 0x09 ||
        point === 0x0a ||
        point === 0x0d ||
        (point >= 0x20 && point <= 0xd7ff) ||
        (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff)
      )
    })
    .join("")

  return clean
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

/** A dependency-free RSS 2.0 document accepted by ordinary feed readers. */
export function renderDirectoryFeedXml(input: {
  siteName: string
  origin: string
  entries: readonly DirectoryFeedEntry[]
}): string {
  const origin = new URL(input.origin).origin
  const feedUrl = new URL("/feed.xml", origin).toString()
  const homeUrl = new URL("/", origin).toString()
  const items = input.entries.map((entry) => {
    const entryUrl = new URL(entry.path, origin).toString()
    return [
      "<item>",
      `<title>${escapeXml(entry.title)}</title>`,
      `<link>${escapeXml(entryUrl)}</link>`,
      `<guid isPermaLink="true">${escapeXml(entryUrl)}</guid>`,
      `<pubDate>${entry.publishedAt.toUTCString()}</pubDate>`,
      entry.category ? `<category>${escapeXml(entry.category)}</category>` : "",
      `<description>${escapeXml(entry.description)}</description>`,
      "</item>",
    ]
      .filter(Boolean)
      .join("")
  })

  const title = `${input.siteName} — New listings, posts and events`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(homeUrl)}</link>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `<description>${escapeXml(`Newest listings, posts and events from ${input.siteName}.`)}</description>`,
    ...(input.entries[0]
      ? [
          `<lastBuildDate>${input.entries[0].publishedAt.toUTCString()}</lastBuildDate>`,
        ]
      : []),
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n")
}
