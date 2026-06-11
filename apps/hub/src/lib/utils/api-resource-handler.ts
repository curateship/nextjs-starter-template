/**
 * Shared API resource handler for content type CRUD routes.
 * Extracts common auth, slug validation, and error handling patterns
 * shared by posts, products, events, and directories routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { auth } from '@/lib/actions/auth/server'
import { generateSlug } from '@/lib/utils/slug'
import { isSameOriginRequest } from '@/lib/utils/request-origin'
import { UUID_REGEX } from '@/lib/utils/validation'

/** Reserved slugs that cannot be used for any content type */
const RESERVED_SLUGS = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/

/** JSON error response helper */
function jsonError(error: string, status: number) {
  return NextResponse.json({ data: null, error }, { status })
}

function jsonServerError() {
  return jsonError('Server error', 500)
}

function jsonInvalidOrigin() {
  return jsonError('Invalid origin', 403)
}

/** Authenticate the request and return the user ID */
async function authenticateRequest(request: NextRequest): Promise<string | NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return jsonError('User not authenticated', 401)
  return session.user.id!
}

/** Verify the user owns the given site. Returns site row or error response. */
async function verifySiteOwnership(siteId: string, userId: string) {
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, userId)),
    columns: { id: true, userId: true },
  })
  if (!site) return jsonError('Site not found or access denied', 403)
  return site
}

/** Validate a slug: format check, reserved check. Returns error response or null. */
function validateSlug(slug: string, reservedSlugs = RESERVED_SLUGS): NextResponse | null {
  if (!SLUG_REGEX.test(slug)) {
    return jsonError('Invalid slug format. Use only letters, numbers, hyphens, and underscores.', 400)
  }
  if (reservedSlugs.includes(slug.toLowerCase())) {
    return jsonError('This slug is reserved and cannot be used.', 400)
  }
  return null
}

// ---- Collection Route (POST) ----

interface CreateResourceConfig {
  /** Display name for error messages, e.g. "Post" */
  entityName: string
  /** Drizzle table reference */
  table: any
  /** Build the insert values from the request data. Receives siteId, slug, nextOrder, contentBlocks. */
  buildInsertValues: (data: any, siteId: string, slug: string, nextOrder: number, contentBlocks: any) => Record<string, any>
  /** Optional resource-specific create validation/data normalization after auth/site ownership. */
  prepareCreateData?: (data: any, userId: string) => Promise<any | NextResponse> | any | NextResponse
  /** Optional response serializer for routes that expose snake_case action shapes. */
  serializeResponse?: (row: any) => unknown
  /** Cache tags to invalidate after a successful create. */
  revalidateTags?: string[]
  /** Enforce same-origin check before processing the request. */
  requireSameOrigin?: boolean
  /** Optional resource-specific reserved slugs (defaults to RESERVED_SLUGS). */
  reservedSlugs?: string[]
  /** Runs after slug validation, immediately before insert — for side effects like
   * unsetting an existing homepage/default flag or extra body validation.
   * Return a NextResponse to abort with that error. */
  beforeInsert?: (data: any, siteId: string) => Promise<NextResponse | void> | NextResponse | void
}

async function findResourceById(table: any, id: string) {
  const rows = await db.select().from(table).where(eq(table.id, id)).limit(1)
  return rows[0] ?? null
}

async function findResourceBySlug(table: any, siteId: string, slug: string) {
  const rows = await db
    .select({ id: table.id, title: table.title })
    .from(table)
    .where(and(eq(table.siteId, siteId), eq(table.slug, slug)))
    .limit(1)

  return rows[0] ?? null
}

async function getNextDisplayOrder(table: any, siteId: string) {
  const rows = await db
    .select({ displayOrder: table.displayOrder })
    .from(table)
    .where(eq(table.siteId, siteId))
    .orderBy(desc(table.displayOrder))
    .limit(1)

  return rows[0] ? rows[0].displayOrder + 1 : 1
}

/**
 * Generic POST handler for creating a content resource.
 * Handles: auth, site ownership, slug generation/validation, uniqueness, and display order.
 */
export function createResourceHandler(config: CreateResourceConfig) {
  return async function POST(request: NextRequest) {
    try {
      if (config.requireSameOrigin && !isSameOriginRequest(request)) return jsonInvalidOrigin()

      let data = await request.json()

      /* Validate required fields */
      if (!data.title?.trim()) return jsonError(`${config.entityName} title is required`, 400)
      if (!data.site_id) return jsonError('Site ID is required', 400)

      /* Auth */
      const userIdOrError = await authenticateRequest(request)
      if (userIdOrError instanceof NextResponse) return userIdOrError
      const userId = userIdOrError

      /* Site ownership */
      const siteOrError = await verifySiteOwnership(data.site_id, userId)
      if (siteOrError instanceof NextResponse) return siteOrError

      if (config.prepareCreateData) {
        const preparedData = await config.prepareCreateData(data, userId)
        if (preparedData instanceof NextResponse) return preparedData
        data = preparedData
      }

      /* Slug */
      let slug = data.slug || generateSlug(data.title)
      const slugError = validateSlug(slug, config.reservedSlugs)
      if (slugError) return slugError

      /* Slug uniqueness check */
      const existing = await findResourceBySlug(config.table, data.site_id, slug)

      if (existing) {
        return jsonError(
          `This slug is already used by another ${config.entityName.toLowerCase()} titled "${existing.title}". Please choose a different slug.`,
          400
        )
      }

      /* Resource-specific pre-insert side effects (e.g. unset existing homepage flag) */
      if (config.beforeInsert) {
        const beforeResult = await config.beforeInsert(data, data.site_id)
        if (beforeResult instanceof NextResponse) return beforeResult
      }

      /* Display order */
      const nextOrder = await getNextDisplayOrder(config.table, data.site_id)

      const contentBlocks = data.content_blocks || {}

      /* Insert */
      const insertValues = config.buildInsertValues(data, data.site_id, slug, nextOrder, contentBlocks)
      const result = await db.insert(config.table).values(insertValues).returning() as any[]
      const newRow = result[0]
      revalidateResourceTags(config.revalidateTags)

      return NextResponse.json({ data: config.serializeResponse ? config.serializeResponse(newRow) : newRow, error: null }, { status: 201 })
    } catch (error) {
      console.error('API Error:', error)
      return jsonServerError()
    }
  }
}

// ---- Item Routes (GET / PUT) ----

interface ItemResourceConfig {
  /** Display name, e.g. "Post" */
  entityName: string
  /** Optional resource-specific not-found message. */
  notFoundMessage?: string
  /** Drizzle table reference */
  table: any
  /** The dynamic route param name, e.g. "postId" */
  paramName: string
  /** Optional resource-specific reserved slugs. */
  reservedSlugs?: string[]
  /** Enforce same-origin checks for mutating requests. */
  requireSameOrigin?: boolean
  /** Optional resource-specific duplicate slug message. */
  duplicateSlugError?: (existing: { title: string | null }, slug: string) => string
  /** Map snake_case request fields to camelCase DB columns for updates */
  updateFieldMap: Record<string, string>
  /** Optional transform for resource-specific update behavior */
  transformUpdateValues?: (updates: Record<string, unknown>, entity: any, updateValues: Record<string, unknown>) => Promise<Record<string, unknown> | NextResponse> | Record<string, unknown> | NextResponse
  /** Optional response serializer for routes that expose snake_case action shapes. */
  serializeResponse?: (row: any) => unknown
  /** Cache tags to invalidate after a successful update. */
  revalidateTags?: string[]
}

function revalidateResourceTags(tags?: string[]) {
  for (const tag of tags || []) {
    revalidateTag(tag)
  }
}

/**
 * Generic GET handler for fetching a single content resource by ID.
 */
export function getResourceHandler(config: ItemResourceConfig) {
  return async function GET(
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> }
  ) {
    try {
      const resolvedParams = await params
      const entityId = resolvedParams[config.paramName]

      if (!UUID_REGEX.test(entityId)) return jsonError(`Invalid ${config.entityName.toLowerCase()} ID format`, 400)

      /* Auth */
      const userIdOrError = await authenticateRequest(request)
      if (userIdOrError instanceof NextResponse) return userIdOrError

      /* Fetch entity */
      const entity = await findResourceById(config.table, entityId)
      if (!entity) return jsonError(config.notFoundMessage || `${config.entityName} not found`, 404)

      /* Site ownership */
      const siteOrError = await verifySiteOwnership(entity.siteId, userIdOrError)
      if (siteOrError instanceof NextResponse) return siteOrError

      return NextResponse.json({ data: config.serializeResponse ? config.serializeResponse(entity) : entity, error: null })
    } catch (error) {
      console.error('API Error:', error)
      return jsonServerError()
    }
  }
}

/**
 * Generic PUT handler for updating a single content resource by ID.
 */
export function updateResourceHandler(config: ItemResourceConfig) {
  return async function PUT(
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> }
  ) {
    try {
      if (config.requireSameOrigin && !isSameOriginRequest(request)) return jsonInvalidOrigin()

      const resolvedParams = await params
      const entityId = resolvedParams[config.paramName]
      const updates = await request.json()

      if (!UUID_REGEX.test(entityId)) return jsonError(`Invalid ${config.entityName.toLowerCase()} ID format`, 400)

      /* Auth */
      const userIdOrError = await authenticateRequest(request)
      if (userIdOrError instanceof NextResponse) return userIdOrError

      /* Fetch entity */
      const entity = await findResourceById(config.table, entityId)
      if (!entity) return jsonError(`${config.entityName} not found`, 404)

      /* Site ownership */
      const siteOrError = await verifySiteOwnership(entity.siteId, userIdOrError)
      if (siteOrError instanceof NextResponse) return siteOrError

      /* Validate title */
      if (updates.title !== undefined && !updates.title?.trim()) {
        return jsonError(`${config.entityName} title cannot be empty`, 400)
      }

      /* Validate slug */
      if (updates.slug !== undefined) {
        const slug = updates.slug.trim()
        const slugError = validateSlug(slug, config.reservedSlugs)
        if (slugError) return slugError
        updates.slug = slug

        /* Uniqueness check (excluding current entity) */
        const existing = await findResourceBySlug(config.table, entity.siteId, slug)
        if (existing && existing.id !== entityId) {
          return jsonError(
            config.duplicateSlugError
              ? config.duplicateSlugError(existing, slug)
              : `A ${config.entityName.toLowerCase()} with the slug "${slug}" already exists. Please choose a different slug.`,
            400
          )
        }
      }

      /* Build update values */
      const updateValues: Record<string, unknown> = { updatedAt: new Date() }
      for (const [snakeKey, camelKey] of Object.entries(config.updateFieldMap)) {
        if (updates[snakeKey] !== undefined) {
          if (camelKey === 'createdAt' || camelKey === 'updatedAt') {
            const value = updates[snakeKey]
            if (value === null || value === '') return jsonError(`Invalid ${snakeKey} value`, 400)

            const date = new Date(value)
            if (Number.isNaN(date.getTime())) return jsonError(`Invalid ${snakeKey} value`, 400)
            updateValues[camelKey] = date
          } else {
            updateValues[camelKey] = updates[snakeKey]
          }
        }
      }

      const finalUpdateValues = config.transformUpdateValues
        ? await config.transformUpdateValues(updates, entity, updateValues)
        : updateValues
      if (finalUpdateValues instanceof NextResponse) return finalUpdateValues

      /* Update */
      const updateResult = await db.update(config.table)
        .set(finalUpdateValues)
        .where(eq(config.table.id, entityId))
        .returning() as any[]
      const updatedRow = updateResult[0]
      revalidateResourceTags(config.revalidateTags)

      return NextResponse.json({ data: config.serializeResponse ? config.serializeResponse(updatedRow) : updatedRow, error: null })
    } catch (error) {
      console.error('API Error:', error)
      return jsonServerError()
    }
  }
}
