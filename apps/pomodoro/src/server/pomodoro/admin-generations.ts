import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { deleteAdminUploads } from "@/server/pomodoro/admin-uploads"
import { pomodoroGenerations } from "@/server/pomodoro/schema"
import { customShellMedia, customShellUsers as users } from "@/server/schema"
import { GENERATION_MODELS, type GenerationKind } from "@/lib/pomodoro/generation"
import type {
  GENERATION_KIND_FILTERS,
  GENERATION_STATUS_FILTERS,
  GenerationSortColumn,
} from "@/lib/pomodoro/admin-lists"

/**
 * AI generations in the admin (admin task 06, part 12): every background and
 * soundscape a member asked for, what came of it, and deleting the file. See
 * `workspace/docs/ai-generation.md`.
 *
 * The provider is not stored on the row. Each kind has one provider and model
 * (`GENERATION_MODELS`), so the page names the kind's current one; the shell's
 * AI usage page has the per-attempt record with the model that was billed.
 */

export type AdminGenerationRow = {
  id: string
  userId: string
  ownerName: string
  ownerEmail: string
  kind: GenerationKind
  prompt: string
  status: string
  failureReason: string | null
  provider: string
  model: string
  mediaId: string | null
  /** The file's address once it exists and is ready. */
  url: string
  /** "image", "audio" or "video", for the preview. Null when there is no file. */
  fileType: string | null
  createdAt: Date
}

export async function listAdminGenerations(query: {
  search: string
  kind: (typeof GENERATION_KIND_FILTERS)[number]
  status: (typeof GENERATION_STATUS_FILTERS)[number]
  user?: string
  sort: GenerationSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}): Promise<{ rows: AdminGenerationRow[]; total: number }> {
  const filters: SQL[] = []
  if (query.kind !== "all") filters.push(eq(pomodoroGenerations.kind, query.kind))
  if (query.status !== "all") filters.push(eq(pomodoroGenerations.status, query.status))
  if (query.user) filters.push(eq(pomodoroGenerations.userId, query.user))
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(pomodoroGenerations.prompt, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    )
    if (match) filters.push(match)
  }
  const where = filters.length ? and(...filters) : undefined
  const order = query.direction === "asc" ? asc : desc
  const sortColumn = {
    person: users.name,
    status: pomodoroGenerations.status,
    created: pomodoroGenerations.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroGenerations.id,
        userId: pomodoroGenerations.userId,
        ownerName: users.name,
        ownerEmail: users.email,
        kind: pomodoroGenerations.kind,
        prompt: pomodoroGenerations.prompt,
        status: pomodoroGenerations.status,
        failureReason: pomodoroGenerations.failureReason,
        mediaId: pomodoroGenerations.mediaId,
        createdAt: pomodoroGenerations.createdAt,
        storagePath: customShellMedia.storagePath,
        fileType: customShellMedia.fileType,
      })
      .from(pomodoroGenerations)
      .innerJoin(users, eq(users.id, pomodoroGenerations.userId))
      .leftJoin(customShellMedia, eq(customShellMedia.id, pomodoroGenerations.mediaId))
      .where(where)
      .orderBy(order(sortColumn), asc(pomodoroGenerations.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroGenerations)
      .innerJoin(users, eq(users.id, pomodoroGenerations.userId))
      .where(where),
  ])

  return {
    rows: await Promise.all(
      rows.map(async ({ storagePath, ...row }) => {
        const kind = row.kind as GenerationKind
        return {
          ...row,
          kind,
          provider: GENERATION_MODELS[kind].provider,
          model: GENERATION_MODELS[kind].model,
          url: row.status === "ready" && storagePath ? await getPublicMediaUrl(storagePath) : "",
        }
      })
    ),
    total: totalRow?.total ?? 0,
  }
}

/**
 * Deletes the files these generations made. The generation row stays, with
 * its prompt and outcome and no file, because the schema sets `media_id` to
 * null when the file goes. A generation with no file has nothing to delete
 * and is skipped.
 */
export async function deleteAdminGenerationFiles({
  generationIds,
  actorUserId,
}: {
  generationIds: string[]
  actorUserId: string
}) {
  const withFiles = await db
    .select({ id: pomodoroGenerations.id, mediaId: pomodoroGenerations.mediaId })
    .from(pomodoroGenerations)
    .where(and(inArray(pomodoroGenerations.id, generationIds), isNotNull(pomodoroGenerations.mediaId)))
  const mediaIds = withFiles.flatMap((row) => (row.mediaId ? [row.mediaId] : []))
  if (!mediaIds.length) return { deleted: [], skipped: generationIds }

  const { deleted } = await deleteAdminUploads({ mediaIds, actorUserId, resource: "generation_files" })
  const gone = new Set(deleted)
  const done = withFiles.filter((row) => row.mediaId && gone.has(row.mediaId)).map((row) => row.id)
  return { deleted: done, skipped: generationIds.filter((id) => !done.includes(id)) }
}
