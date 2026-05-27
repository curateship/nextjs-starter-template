import { createHash } from "node:crypto"

import { and, asc, eq, gt } from "drizzle-orm"

import { db } from "@/server/db"
import {
  publicDirectories,
  type CorePublicDirectory,
} from "@/server/schema"
import {
  getWorkspacePublicReadTokenHash,
  publicReadTokenMatches,
} from "@/server/public-read-token"

const MAX_LIST_LIMIT = 100
const DEFAULT_LIST_LIMIT = 50
const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/

export type PublicDirectoryItem = {
  id: string
  slug: string
  title: string
  metaDescription: string | null
  featuredImage: string | null
  business: {
    description?: string
    address?: string
    phone?: string
    website?: string
    rating?: number
    reviewCount?: number
    placeId?: string
    mapsUrl?: string
    socialLinks?: Array<{ platform: string; url: string }>
    openingHours?: Record<string, unknown>
  }
}

export function createPublicDirectoryDraftValues({
  createdAt,
  externalId,
  id,
  sourceResultId,
  title,
  data,
  workspaceId,
}: {
  createdAt: Date
  externalId?: string | null
  id: string
  sourceResultId: string | null
  title: string
  data: Record<string, unknown>
  workspaceId: string
}) {
  const slugId = stringValue(data.placeId) || stringValue(data.externalId) || externalId || sourceResultId || id
  const publicData = pickPublicDirectoryData(data)

  return {
    id,
    workspaceId,
    sourceResultId,
    slug: createPublicDirectorySlug(title, slugId),
    status: "draft",
    title: title.trim().slice(0, 255) || "Untitled place",
    metaDescription: stringValue(data.address) || null,
    featuredImage: stringValue(data.featuredImage) || null,
    publicData,
    createdAt,
    updatedAt: createdAt,
  }
}

export async function isPublicReadAuthorized(request: Request, workspaceId: string) {
  const token = getBearerToken(request)

  if (!token) return false

  const workspaceTokenHash = await getWorkspacePublicReadTokenHash(workspaceId)
  if (workspaceTokenHash && publicReadTokenMatches(workspaceTokenHash, token)) {
    return true
  }

  return false
}

export function isValidWorkspaceId(value: string) {
  return ID_REGEX.test(value)
}

export function isValidDirectorySlug(value: string) {
  return value.length <= 100 && SLUG_REGEX.test(value)
}

export async function listPublicDirectories({
  cursor,
  limit,
  workspaceId,
}: {
  cursor?: string | null
  limit?: string | null
  workspaceId: string
}) {
  const pageSize = normalizeLimit(limit)
  const conditions = [
    eq(publicDirectories.workspaceId, workspaceId),
    eq(publicDirectories.status, "published"),
  ]

  if (cursor && isValidDirectorySlug(cursor)) {
    conditions.push(gt(publicDirectories.slug, cursor))
  }

  const rows = await db
    .select()
    .from(publicDirectories)
    .where(and(...conditions))
    .orderBy(asc(publicDirectories.slug))
    .limit(pageSize + 1)

  const items = rows.slice(0, pageSize).map(serializePublicDirectory)
  const nextCursor = rows.length > pageSize ? items.at(-1)?.slug ?? null : null

  return { items, nextCursor }
}

export async function getPublicDirectoryBySlug(workspaceId: string, slug: string) {
  const [row] = await db
    .select()
    .from(publicDirectories)
    .where(
      and(
        eq(publicDirectories.workspaceId, workspaceId),
        eq(publicDirectories.slug, slug),
        eq(publicDirectories.status, "published")
      )
    )
    .limit(1)

  return row ? serializePublicDirectory(row) : null
}

function serializePublicDirectory(row: CorePublicDirectory): PublicDirectoryItem {
  const data = record(row.publicData)

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    metaDescription: row.metaDescription,
    featuredImage: row.featuredImage,
    business: {
      description: stringValue(data.description),
      address: stringValue(data.address),
      phone: stringValue(data.phone),
      website: stringValue(data.website),
      rating: numberValue(data.rating),
      reviewCount: numberValue(data.reviewCount),
      placeId: stringValue(data.placeId),
      mapsUrl: stringValue(data.mapsUrl),
      socialLinks: socialLinksValue(data.socialLinks),
      openingHours: recordOrUndefined(data.openingHours),
    },
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || ""
  const [scheme, token] = authorization.split(/\s+/, 2)
  return scheme?.toLowerCase() === "bearer" ? token?.trim() || "" : ""
}

function normalizeLimit(value?: string | null) {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed)) return DEFAULT_LIST_LIMIT
  return Math.min(MAX_LIST_LIMIT, Math.max(1, parsed))
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function recordOrUndefined(value: unknown) {
  const next = record(value)
  return Object.keys(next).length ? next : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function socialLinksValue(value: unknown) {
  if (!Array.isArray(value)) return undefined

  const links = value
    .map((item) => {
      const link = record(item)
      const platform = stringValue(link.platform)
      const url = stringValue(link.url)
      return platform && url ? { platform, url } : null
    })
    .filter((item): item is { platform: string; url: string } => Boolean(item))

  return links.length ? links : undefined
}

function pickPublicDirectoryData(data: Record<string, unknown>) {
  return {
    description: stringValue(data.description),
    address: stringValue(data.address),
    phone: stringValue(data.phone),
    website: stringValue(data.website),
    rating: numberValue(data.rating),
    reviewCount: numberValue(data.reviewCount),
    placeId: stringValue(data.placeId),
    mapsUrl: stringValue(data.mapsUrl),
    socialLinks: socialLinksValue(data.socialLinks),
    openingHours: recordOrUndefined(data.openingHours),
  }
}

function createPublicDirectorySlug(title: string, externalId: string) {
  const suffix = createHash("sha1").update(externalId).digest("hex").slice(0, 8)
  const base = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 91)

  return `${base || "directory"}-${suffix}`
}
