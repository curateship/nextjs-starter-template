import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import sanitizeHtml from "sanitize-html"

import {
  createStarterBlocks,
  parseStoredBlocks,
  safeLinkUrl,
  type BroadcastAudienceFilter,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import { validateDripConfig, type DripConfig } from "@/lib/broadcasts/drip"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import { db, type CustomShellDb } from "@/server/db"
import { getDripDefaults } from "@/server/email/settings"
import {
  customShellBroadcastTemplates,
  customShellBroadcasts,
  type CustomShellBroadcast,
  type CustomShellBroadcastTemplate,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/** The statuses whose content can still be changed. */
const EDITABLE_BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "paused",
] as const

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
 * Rich text comes from the in-app editor, but it is stored and later mailed out
 * word for word — so it is cleaned on the way *in*. Cleaning on the way out
 * would leave unsafe markup sitting in the database waiting for the one code
 * path that forgot to clean it.
 */
export function sanitizeBlocks(blocks: BroadcastBlock[]): BroadcastBlock[] {
  return blocks.map((block) => {
    if (block.kind === "richText") {
      return {
        ...block,
        content: {
          ...block.content,
          htmlContent: sanitizeHtml(
            block.content.htmlContent,
            RICH_TEXT_SANITIZE_OPTIONS
          ),
        },
      }
    }

    // A button's address goes through the same three schemes the rich-text
    // links do. Anything else is dropped rather than stored: this HTML is
    // handed straight to the browser to draw the editor's preview, so a saved
    // `javascript:` address would be a live link for the next admin who opened
    // it. Emptied, not rejected — the box goes blank, which says it was not
    // taken, and the send refuses a button with no address.
    if (block.kind === "button" && block.content.url) {
      return {
        ...block,
        content: { ...block.content, url: safeLinkUrl(block.content.url) },
      }
    }

    return block
  })
}

export async function listWorkspaceBroadcasts(
  workspaceId: string,
  options: { search?: string; limit?: number; offset?: number } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  const filters = [eq(customShellBroadcasts.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(customShellBroadcasts.name, pattern),
      ilike(customShellBroadcasts.subject, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  const where = and(...filters)

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(customShellBroadcasts)
      .where(where)
      .orderBy(desc(customShellBroadcasts.updatedAt))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(customShellBroadcasts)
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
    .from(customShellBroadcasts)
    .where(
      and(
        eq(customShellBroadcasts.workspaceId, workspaceId),
        eq(customShellBroadcasts.id, broadcastId)
      )
    )
    .limit(1)
  return row ?? null
}

/**
 * A new broadcast starts from the workspace's default template if there is one,
 * and from a header / text / footer skeleton if there is not. Never from a
 * blank sheet — an empty email is the one thing nobody wants to start with.
 */
export async function createWorkspaceBroadcast(
  workspaceId: string,
  input: { name: string },
  database: CustomShellDb = db
): Promise<CustomShellBroadcast> {
  const [defaultTemplate] = await database
    .select()
    .from(customShellBroadcastTemplates)
    .where(
      and(
        eq(customShellBroadcastTemplates.workspaceId, workspaceId),
        eq(customShellBroadcastTemplates.isDefault, true)
      )
    )
    .limit(1)

  const templateBlocks = defaultTemplate
    ? parseStoredBlocks(defaultTemplate.blocks)
    : []
  const blocks =
    templateBlocks.length > 0 ? templateBlocks : createStarterBlocks()

  // Copied onto the newsletter rather than read from the settings at send time,
  // so changing the workspace default later cannot quietly re-pace a newsletter
  // somebody already reviewed.
  const dripConfig = await getDripDefaults(workspaceId, database)

  const timestamp = now()
  const [created] = await database
    .insert(customShellBroadcasts)
    .values({
      id: uuid(),
      workspaceId,
      name: input.name.trim().slice(0, 255),
      blocks,
      dripConfig,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (!created) throw new Error("CREATE_FAILED")
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
    dripConfig?: DripConfig
  },
  database: CustomShellDb = db
): Promise<CustomShellBroadcast | null> {
  const existing = await getWorkspaceBroadcast(workspaceId, input.id, database)
  if (!existing) return null
  if (
    !EDITABLE_BROADCAST_STATUSES.includes(
      existing.status as (typeof EDITABLE_BROADCAST_STATUSES)[number]
    )
  ) {
    throw new Error(existing.status === "sending" ? "SENDING" : "ALREADY_SENT")
  }

  const values: Partial<typeof customShellBroadcasts.$inferInsert> = {
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
  if (input.dripConfig !== undefined) {
    const invalid = validateDripConfig(input.dripConfig)
    if (invalid) throw new Error("DRIP_SETTINGS_INVALID")
    values.dripConfig = input.dripConfig
  }

  // Keep the sendable HTML in step with content edits, so a paused broadcast
  // that gets resumed sends what the preview was showing rather than what it
  // looked like when the send first started.
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
    .update(customShellBroadcasts)
    .set(values)
    .where(
      and(
        eq(customShellBroadcasts.workspaceId, workspaceId),
        eq(customShellBroadcasts.id, input.id)
      )
    )
    .returning()

  return updated ?? null
}

export async function duplicateWorkspaceBroadcast(
  workspaceId: string,
  broadcastId: string,
  database: CustomShellDb = db
): Promise<CustomShellBroadcast | null> {
  const existing = await getWorkspaceBroadcast(
    workspaceId,
    broadcastId,
    database
  )
  if (!existing) return null

  const timestamp = now()
  const [created] = await database
    .insert(customShellBroadcasts)
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
    .delete(customShellBroadcasts)
    .where(
      and(
        eq(customShellBroadcasts.workspaceId, workspaceId),
        inArray(customShellBroadcasts.id, broadcastIds)
      )
    )
    .returning({ id: customShellBroadcasts.id })
  return deleted.length
}

export async function listWorkspaceTemplates(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<CustomShellBroadcastTemplate[]> {
  const rows = await database
    .select()
    .from(customShellBroadcastTemplates)
    .where(eq(customShellBroadcastTemplates.workspaceId, workspaceId))
    .orderBy(desc(customShellBroadcastTemplates.updatedAt))

  // The default one first, then most recently touched.
  return rows.sort((a, b) =>
    a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1
  )
}

export async function createWorkspaceTemplate(
  workspaceId: string,
  input: { name: string; blocks: BroadcastBlock[] },
  database: CustomShellDb = db
): Promise<CustomShellBroadcastTemplate> {
  const timestamp = now()
  const [created] = await database
    .insert(customShellBroadcastTemplates)
    .values({
      id: uuid(),
      workspaceId,
      name: input.name.trim().slice(0, 255),
      blocks: sanitizeBlocks(input.blocks),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (!created) throw new Error("CREATE_FAILED")
  return created
}

/**
 * Marks one template as the one new broadcasts start from. In a transaction,
 * because clearing the old default and setting the new one have to land
 * together — the unique index refuses two defaults, so a half-applied change
 * would fail outright.
 */
export async function setDefaultWorkspaceTemplate(
  workspaceId: string,
  templateId: string,
  isDefault: boolean,
  database: CustomShellDb = db
): Promise<CustomShellBroadcastTemplate | null> {
  return database.transaction(async (tx) => {
    const [template] = await tx
      .select()
      .from(customShellBroadcastTemplates)
      .where(
        and(
          eq(customShellBroadcastTemplates.workspaceId, workspaceId),
          eq(customShellBroadcastTemplates.id, templateId)
        )
      )
      .limit(1)
    if (!template) return null

    const timestamp = now()
    if (isDefault) {
      await tx
        .update(customShellBroadcastTemplates)
        .set({ isDefault: false, updatedAt: timestamp })
        .where(
          and(
            eq(customShellBroadcastTemplates.workspaceId, workspaceId),
            eq(customShellBroadcastTemplates.isDefault, true)
          )
        )
    }

    const [updated] = await tx
      .update(customShellBroadcastTemplates)
      .set({ isDefault, updatedAt: timestamp })
      .where(eq(customShellBroadcastTemplates.id, templateId))
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
    .delete(customShellBroadcastTemplates)
    .where(
      and(
        eq(customShellBroadcastTemplates.workspaceId, workspaceId),
        inArray(customShellBroadcastTemplates.id, templateIds)
      )
    )
    .returning({ id: customShellBroadcastTemplates.id })
  return deleted.length
}
