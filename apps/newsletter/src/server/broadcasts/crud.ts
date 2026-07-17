import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import sanitizeHtml from "sanitize-html"

import {
  createStarterBlocks,
  parseStoredBlocks,
  type BroadcastAudienceFilter,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import type { BroadcastDripConfig } from "@/lib/broadcasts/drip"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import { db, type CustomShellDb } from "@/server/db"
import {
  newsletterBroadcastTemplates,
  newsletterBroadcasts,
  type NewsletterBroadcast,
  type NewsletterBroadcastTemplate,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

/** Statuses whose content is still editable. */
const EDITABLE_BROADCAST_STATUSES = ["draft", "scheduled", "paused"] as const

const RICH_TEXT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "img",
    "code",
    "pre",
  ],
  allowedAttributes: {
    a: ["href"],
    img: ["src", "alt", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
}

/**
 * Rich text arrives from the in-app editor, but it is stored and later mailed
 * verbatim — sanitize on write so persisted blocks are safe by construction.
 */
export function sanitizeBlocks(blocks: BroadcastBlock[]): BroadcastBlock[] {
  return blocks.map((block) =>
    block.kind === "richText"
      ? {
          ...block,
          content: {
            ...block.content,
            htmlContent: sanitizeHtml(
              block.content.htmlContent,
              RICH_TEXT_SANITIZE_OPTIONS
            ),
          },
        }
      : block
  )
}

export async function listWorkspaceBroadcasts(
  workspaceId: string,
  options: { search?: string; limit?: number; offset?: number } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  const filters = [eq(newsletterBroadcasts.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(newsletterBroadcasts.name, pattern),
      ilike(newsletterBroadcasts.subject, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(newsletterBroadcasts)
      .where(where)
      .orderBy(desc(newsletterBroadcasts.updatedAt))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(newsletterBroadcasts)
      .where(where),
  ])

  return { broadcasts: rows, total: countRow?.total ?? 0 }
}

export async function getWorkspaceBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select()
    .from(newsletterBroadcasts)
    .where(
      and(
        eq(newsletterBroadcasts.workspaceId, workspaceId),
        eq(newsletterBroadcasts.id, broadcastId)
      )
    )
    .limit(1)
  return row ?? null
}

export async function createWorkspaceBroadcast(
  workspaceId: string,
  input: { name: string },
  database: CustomShellDb = db
): Promise<NewsletterBroadcast> {
  const [defaultTemplate] = await database
    .select()
    .from(newsletterBroadcastTemplates)
    .where(
      and(
        eq(newsletterBroadcastTemplates.workspaceId, workspaceId),
        eq(newsletterBroadcastTemplates.isDefault, true)
      )
    )
    .limit(1)

  const templateBlocks = defaultTemplate
    ? parseStoredBlocks(defaultTemplate.blocks)
    : []
  const blocks =
    templateBlocks.length > 0 ? templateBlocks : createStarterBlocks()

  const timestamp = now()
  const [created] = await database
    .insert(newsletterBroadcasts)
    .values({
      id: uuid(),
      workspaceId,
      name: input.name.trim().slice(0, 255),
      blocks,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (!created) throw new Error("Broadcast was not created")
  return created
}

export async function updateWorkspaceBroadcast(
  workspaceId: string,
  input: {
    id: string
    name?: string
    subject?: string
    preheader?: string
    fromName?: string | null
    blocks?: BroadcastBlock[]
    audienceFilter?: BroadcastAudienceFilter
    dripConfig?: BroadcastDripConfig
  },
  database: CustomShellDb = db
): Promise<NewsletterBroadcast | null> {
  const existing = await getWorkspaceBroadcast(workspaceId, input.id, database)
  if (!existing) return null
  if (
    !EDITABLE_BROADCAST_STATUSES.includes(
      existing.status as (typeof EDITABLE_BROADCAST_STATUSES)[number]
    )
  ) {
    throw new Error(
      existing.status === "sending"
        ? "This broadcast is currently sending. Pause it before editing."
        : "This broadcast was already sent and can no longer be edited."
    )
  }

  const values: Partial<typeof newsletterBroadcasts.$inferInsert> = {
    updatedAt: now(),
  }
  if (input.name !== undefined) values.name = input.name.trim().slice(0, 255)
  if (input.subject !== undefined) values.subject = input.subject
  if (input.preheader !== undefined) values.preheader = input.preheader
  if (input.fromName !== undefined) {
    values.fromName = input.fromName?.trim() || null
  }
  if (input.blocks !== undefined) values.blocks = sanitizeBlocks(input.blocks)
  if (input.audienceFilter !== undefined) {
    values.audienceFilter = input.audienceFilter
  }
  if (input.dripConfig !== undefined) values.dripConfig = input.dripConfig

  // Keep the sendable HTML in lockstep with content edits so a paused
  // broadcast that resumes sends what the preview showed.
  if (input.blocks !== undefined || input.preheader !== undefined) {
    const blocks =
      input.blocks !== undefined
        ? (values.blocks as BroadcastBlock[])
        : parseStoredBlocks(existing.blocks)
    values.renderedHtml = renderBroadcastEmailHtml(blocks, {
      preheader: input.preheader ?? existing.preheader,
    })
  }

  const [updated] = await database
    .update(newsletterBroadcasts)
    .set(values)
    .where(
      and(
        eq(newsletterBroadcasts.workspaceId, workspaceId),
        eq(newsletterBroadcasts.id, input.id)
      )
    )
    .returning()

  return updated ?? null
}

export async function duplicateWorkspaceBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
): Promise<NewsletterBroadcast | null> {
  const existing = await getWorkspaceBroadcast(
    workspaceId,
    broadcastId,
    database
  )
  if (!existing) return null

  const timestamp = now()
  const [created] = await database
    .insert(newsletterBroadcasts)
    .values({
      id: uuid(),
      workspaceId,
      name: `${existing.name} (copy)`.slice(0, 255),
      subject: existing.subject,
      preheader: existing.preheader,
      fromName: existing.fromName,
      blocks: existing.blocks,
      renderedHtml: existing.renderedHtml,
      audienceFilter: existing.audienceFilter,
      dripConfig: existing.dripConfig,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  return created ?? null
}

export async function deleteWorkspaceBroadcasts(
  workspaceId: string,
  broadcastIds: string[],
  database: CustomShellDb = db
) {
  if (broadcastIds.length === 0) return 0
  const deleted = await database
    .delete(newsletterBroadcasts)
    .where(
      and(
        eq(newsletterBroadcasts.workspaceId, workspaceId),
        inArray(newsletterBroadcasts.id, broadcastIds)
      )
    )
    .returning({ id: newsletterBroadcasts.id })
  return deleted.length
}

export async function listWorkspaceTemplates(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<NewsletterBroadcastTemplate[]> {
  const rows = await database
    .select()
    .from(newsletterBroadcastTemplates)
    .where(eq(newsletterBroadcastTemplates.workspaceId, workspaceId))
    .orderBy(desc(newsletterBroadcastTemplates.updatedAt))

  return rows.sort((a, b) =>
    a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1
  )
}

export async function createWorkspaceTemplate(
  workspaceId: string,
  input: { name: string; blocks: BroadcastBlock[] },
  database: CustomShellDb = db
): Promise<NewsletterBroadcastTemplate> {
  const timestamp = now()
  const [created] = await database
    .insert(newsletterBroadcastTemplates)
    .values({
      id: uuid(),
      workspaceId,
      name: input.name.trim().slice(0, 255),
      blocks: sanitizeBlocks(input.blocks),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (!created) throw new Error("Template was not created")
  return created
}

export async function setDefaultWorkspaceTemplate(
  workspaceId: string,
  templateId: string,
  isDefault: boolean,
  database: CustomShellDb = db
): Promise<NewsletterBroadcastTemplate | null> {
  return database.transaction(async (tx) => {
    const [template] = await tx
      .select()
      .from(newsletterBroadcastTemplates)
      .where(
        and(
          eq(newsletterBroadcastTemplates.workspaceId, workspaceId),
          eq(newsletterBroadcastTemplates.id, templateId)
        )
      )
      .limit(1)
    if (!template) return null

    const timestamp = now()
    if (isDefault) {
      await tx
        .update(newsletterBroadcastTemplates)
        .set({ isDefault: false, updatedAt: timestamp })
        .where(
          and(
            eq(newsletterBroadcastTemplates.workspaceId, workspaceId),
            eq(newsletterBroadcastTemplates.isDefault, true)
          )
        )
    }

    const [updated] = await tx
      .update(newsletterBroadcastTemplates)
      .set({ isDefault, updatedAt: timestamp })
      .where(eq(newsletterBroadcastTemplates.id, templateId))
      .returning()

    return updated ?? null
  })
}

export async function deleteWorkspaceTemplates(
  workspaceId: string,
  templateIds: string[],
  database: CustomShellDb = db
) {
  if (templateIds.length === 0) return 0
  const deleted = await database
    .delete(newsletterBroadcastTemplates)
    .where(
      and(
        eq(newsletterBroadcastTemplates.workspaceId, workspaceId),
        inArray(newsletterBroadcastTemplates.id, templateIds)
      )
    )
    .returning({ id: newsletterBroadcastTemplates.id })
  return deleted.length
}
