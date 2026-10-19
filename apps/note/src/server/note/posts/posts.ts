import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { getAiKey } from "@/server/ai/keys"
import { checkAiAllowance } from "@/server/ai/usage"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { deleteFromR2, getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { fetchArticle } from "@/server/note/posts/article"
import { requireOwnPostFolder } from "@/server/note/posts/folders"
import { notePostFolders, notePosts, type NotePostRow } from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import { cleanHighlights, firstHighlightText } from "@/lib/note/posts/highlights"
import { parsePostLink } from "@/lib/note/posts/links"
import {
  analyseRefusal,
  atHandle,
  isPostAnalysing,
  MANY_AT_ONCE_MAX,
  PLAN_STEP_MAX,
  PLAN_STEPS_MAX,
  planProgress,
  POST_SAYS,
  POSTS_PAGE_SIZE,
  SIMILAR_POSTS_MAX,
  type AnalyseInputs,
  type Highlight,
  type HighlightPart,
  type NotePostCard,
  type NotePostDetail,
  type NotePostPage,
  type PictureView,
  type PlanStep,
  type PostAuthor,
  type PostFilters,
  type PostPicture,
} from "@/lib/note/posts/posts"
import { NO_FOLDER, NOTE_SAYS } from "@/lib/note/videos"

/**
 * One person's saved X posts: saving a link, reading the list and one post,
 * and every change a click makes.
 *
 * Nothing slow happens here except bringing in an article, which the person
 * asked for and waits on. Saving writes a row and returns; reading X, the
 * video download and the AI happen in the `note-posts` worker (`jobs.ts`),
 * which finds the row by its status. Every query is scoped to the owner, so
 * one person never sees another's posts.
 */

/** Saving reads a page from X, so one person may save sixty in ten minutes, as Videos allows. */
const SAVE_LIMIT = { maxAttempts: 60, windowSeconds: 10 * 60 }
/** Bringing in an article fetches a stranger's page while the person waits. */
const ARTICLE_LIMIT = { maxAttempts: 30, windowSeconds: 10 * 60 }
/** The most pictures one Analyse sends, across the post, its quote and its thread. */
export const PICTURES_PER_ANALYSIS = 12

// ---------------------------------------------------------------------------
// Saving

/** Writes the row the worker will read, or hands back the one already there. */
export async function savePostLink(
  ownerId: string,
  raw: string
): Promise<{ post: NotePostCard; alreadySaved: boolean }> {
  const link = parsePostLink(raw)
  await enforceRateLimit(`note-save-post:${ownerId}`, SAVE_LIMIT)
  const at = now()
  try {
    const [created] = await db
      .insert(notePosts)
      .values({
        id: uuid(),
        ownerId,
        kind: "post",
        postId: link.postId,
        url: link.url,
        status: "waiting",
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    return { post: await cardFor(created), alreadySaved: false }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }
  const [existing] = await db
    .select()
    .from(notePosts)
    .where(and(eq(notePosts.ownerId, ownerId), eq(notePosts.postId, link.postId)))
  if (!existing) throw new Error(POST_SAYS.postNotFound)
  return { post: await cardFor(existing), alreadySaved: true }
}

// ---------------------------------------------------------------------------
// Reading

/**
 * One page of the middle panel, newest first, narrowed by folder, author,
 * tag, plan progress and the search box. The search reads the words, the
 * quoted post, the thread, the article's title, the author, the summary and
 * the tags, and a highlight is part of the words, so search finds it too.
 */
export async function listPosts(
  ownerId: string,
  options: PostFilters & { cursor?: string | null } = {}
): Promise<NotePostPage> {
  const filters: SQL[] = [eq(notePosts.ownerId, ownerId)]
  if (options.folder === NO_FOLDER) filters.push(isNull(notePosts.folderId))
  else if (options.folder) filters.push(eq(notePosts.folderId, options.folder))
  if (options.author) filters.push(sql`lower(${notePosts.authorHandle}) = ${options.author.toLowerCase()}`)
  if (options.tag) filters.push(sql`${notePosts.tags} @> ${JSON.stringify([options.tag])}::jsonb`)
  if (options.progress) filters.push(progressFilter(options.progress))

  const search = options.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
    const matches = or(
      ilike(notePosts.text, pattern),
      ilike(notePosts.authorName, pattern),
      ilike(notePosts.authorHandle, pattern),
      ilike(notePosts.articleTitle, pattern),
      sql`${notePosts.quoted}::text ilike ${pattern}`,
      sql`${notePosts.thread}::text ilike ${pattern}`,
      sql`${notePosts.summary}::text ilike ${pattern}`,
      sql`${notePosts.tags}::text ilike ${pattern}`
    )
    if (matches) filters.push(matches)
  }

  const after = readCursor(options.cursor)
  if (after) {
    const older = or(
      lt(notePosts.createdAt, after.createdAt),
      and(eq(notePosts.createdAt, after.createdAt), lt(notePosts.id, after.id))
    )
    if (older) filters.push(older)
  }

  const [rows, similarCount] = await Promise.all([
    db
      .select()
      .from(notePosts)
      .where(and(...filters))
      .orderBy(desc(notePosts.createdAt), desc(notePosts.id))
      .limit(POSTS_PAGE_SIZE + 1),
    countAnalysed(ownerId),
  ])
  const page = rows.slice(0, POSTS_PAGE_SIZE)
  const last = page.at(-1)
  return {
    posts: await Promise.all(page.map(cardFor)),
    nextCursor:
      rows.length > POSTS_PAGE_SIZE && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    similarCount,
  }
}

function progressFilter(progress: NonNullable<PostFilters["progress"]>): SQL {
  const hasPlan = sql`jsonb_typeof(${notePosts.actionPlan}) = 'array' and jsonb_array_length(${notePosts.actionPlan}) > 0`
  const someTicked = sql`jsonb_path_exists(${notePosts.actionPlan}, '$[*] ? (@.done == true)')`
  const someOpen = sql`jsonb_path_exists(${notePosts.actionPlan}, '$[*] ? (@.done == false)')`
  if (progress === "done") return sql`(${hasPlan} and not ${someOpen})`
  if (progress === "in_progress") return sql`(${hasPlan} and ${someTicked} and ${someOpen})`
  return sql`(${hasPlan} and not ${someTicked})`
}

/** How many of this person's analysed posts the similar-post check would read. */
async function countAnalysed(ownerId: string, besides?: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notePosts)
    .where(
      and(
        eq(notePosts.ownerId, ownerId),
        eq(notePosts.kind, "post"),
        isNotNull(notePosts.summary),
        besides ? ne(notePosts.id, besides) : undefined
      )
    )
  return Math.min(Number(row?.total ?? 0), SIMILAR_POSTS_MAX)
}

function readCursor(cursor: string | null | undefined) {
  if (!cursor) return null
  const [at, id] = cursor.split("|")
  const createdAt = new Date(at ?? "")
  if (!id || Number.isNaN(createdAt.getTime())) return null
  return { createdAt, id }
}

/** The authors of this person's saved posts, most saved first, with a count each. */
export async function listPostAuthors(ownerId: string): Promise<PostAuthor[]> {
  const rows = await db
    .select({
      handle: notePosts.authorHandle,
      name: sql<string | null>`(array_agg(${notePosts.authorName} order by ${notePosts.createdAt} desc))[1]`,
      picture: sql<string | null>`(array_agg(${notePosts.authorPicturePath} order by ${notePosts.createdAt} desc))[1]`,
      total: count(),
    })
    .from(notePosts)
    .where(and(eq(notePosts.ownerId, ownerId), isNotNull(notePosts.authorHandle)))
    .groupBy(notePosts.authorHandle)
    .orderBy(desc(count()), notePosts.authorHandle)
    .limit(100)
  return Promise.all(
    rows.flatMap((row) =>
      row.handle
        ? [
            (async (): Promise<PostAuthor> => ({
              handle: row.handle ?? "",
              name: row.name,
              pictureUrl: row.picture ? await getPublicMediaUrl(row.picture) : null,
              count: Number(row.total),
            }))(),
          ]
        : []
    )
  )
}

/** The cards for these ids, as they are now. A missing one is gone. */
export async function refreshPosts(ownerId: string, ids: string[]): Promise<NotePostCard[]> {
  if (!ids.length) return []
  const rows = await db
    .select()
    .from(notePosts)
    .where(and(eq(notePosts.ownerId, ownerId), inArray(notePosts.id, ids)))
  return Promise.all(rows.map(cardFor))
}

export async function loadPost(ownerId: string, id: string): Promise<NotePostDetail> {
  return detailFor(await requireOwnPost(ownerId, id))
}

async function requireOwnPost(ownerId: string, id: string): Promise<NotePostRow> {
  const [row] = await db
    .select()
    .from(notePosts)
    .where(and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId)))
  if (!row) throw new Error(POST_SAYS.postNotFound)
  return row
}

/** "@naval", "Plan from 4 posts", or before the post is read, "X post". */
export function postTitle(row: Pick<NotePostRow, "kind" | "authorHandle" | "sourcePostIds">) {
  if (row.kind === "merged") return `Plan from ${row.sourcePostIds?.length ?? 0} posts`
  return atHandle(row.authorHandle)
}

/** The words of each part a highlight can sit on. */
function partTextOf(row: Pick<NotePostRow, "text" | "quoted" | "thread">) {
  return (part: HighlightPart): string | null => {
    if (part === "post") return row.text
    if (part === "quoted") return row.quoted?.text ?? null
    const index = Number(part.slice("thread-".length))
    return row.thread?.[index]?.text ?? null
  }
}

/** Every picture the AI would read, in order: the post's, the quoted post's, the thread's. */
export function allPictures(row: Pick<NotePostRow, "pictures" | "quoted" | "thread">): PostPicture[] {
  return [
    ...(row.pictures ?? []),
    ...(row.quoted?.pictures ?? []),
    ...(row.thread ?? []).flatMap((post) => post.pictures),
  ]
}

/** What the price line needs, from what is saved now. */
function analyseInputs(row: NotePostRow): AnalyseInputs {
  const transcript = row.transcript ?? []
  const chars =
    (row.text?.length ?? 0) +
    (row.quoted?.text.length ?? 0) +
    (row.thread ?? []).reduce((sum, post) => sum + post.text.length, 0) +
    (row.articleText?.length ?? 0) +
    transcript.reduce((sum, line) => sum + line.text.length + 1, 0)
  // A video is written down once, even when nobody speaks in it.
  const videoSeconds =
    row.videoStatus === "saved" && row.videoMediaId && row.transcript === null ? (row.videoSeconds ?? 0) : 0
  return { chars, pictures: Math.min(allPictures(row).length, PICTURES_PER_ANALYSIS), videoSeconds }
}

async function pictureUrl(path: string | null | undefined) {
  return path ? getPublicMediaUrl(path) : null
}

async function pictureViews(pictures: PostPicture[] | null | undefined): Promise<PictureView[]> {
  return Promise.all(
    (pictures ?? []).map(async (picture) => ({
      url: await getPublicMediaUrl(picture.path),
      width: picture.width,
      height: picture.height,
    }))
  )
}

async function cardFor(row: NotePostRow): Promise<NotePostCard> {
  const firstPicture = row.pictures?.[0]?.path ?? row.videoCoverPath ?? row.quoted?.pictures[0]?.path
  return {
    id: row.id,
    kind: row.kind,
    folderId: row.folderId,
    url: row.url,
    status: row.status,
    error: row.error,
    hasText: row.text !== null,
    title: postTitle(row),
    authorName: row.authorName,
    authorHandle: row.authorHandle,
    authorPictureUrl: await pictureUrl(row.authorPicturePath),
    postedAt: row.postedAt?.toISOString() ?? null,
    firstLines: row.text ? row.text.replace(/\s+/g, " ").trim().slice(0, 280) || null : null,
    firstPictureUrl: await pictureUrl(firstPicture),
    firstHighlight: firstHighlightText(row.highlights, partTextOf(row)),
    firstSummaryLine: row.summary?.[0] ?? null,
    tags: row.tags ?? [],
    progress: planProgress(row.actionPlan),
    videoStatus: row.videoStatus,
    analyse: analyseInputs(row),
    planChars: (row.actionPlan ?? []).reduce((sum, step) => sum + step.text.length + 1, 0),
    createdAt: row.createdAt.toISOString(),
  }
}

async function detailFor(row: NotePostRow): Promise<NotePostDetail> {
  const [suggested, similar, sources, video] = await Promise.all([
    row.suggestedFolderId
      ? db
          .select({ id: notePostFolders.id, name: notePostFolders.name })
          .from(notePostFolders)
          .where(and(eq(notePostFolders.id, row.suggestedFolderId), eq(notePostFolders.ownerId, row.ownerId)))
      : [],
    row.similarPostId
      ? db
          .select()
          .from(notePosts)
          .where(and(eq(notePosts.id, row.similarPostId), eq(notePosts.ownerId, row.ownerId)))
      : [],
    row.sourcePostIds?.length
      ? db
          .select()
          .from(notePosts)
          .where(and(eq(notePosts.ownerId, row.ownerId), inArray(notePosts.id, row.sourcePostIds)))
      : [],
    row.videoMediaId
      ? db
          .select({ storagePath: customShellMedia.storagePath })
          .from(customShellMedia)
          .where(eq(customShellMedia.id, row.videoMediaId))
      : [],
  ])
  const similarRow = similar[0]
  const order = new Map((row.sourcePostIds ?? []).map((id, index) => [id, index]))
  return {
    ...(await cardFor(row)),
    text: row.text ?? "",
    pictures: await pictureViews(row.pictures),
    quoted: row.quoted ? { ...row.quoted, pictures: await pictureViews(row.quoted.pictures) } : null,
    thread: await Promise.all(
      (row.thread ?? []).map(async (post) => ({ ...post, pictures: await pictureViews(post.pictures) }))
    ),
    threadStatus: row.threadStatus,
    articleTitle: row.articleTitle,
    hasArticleText: row.articleText !== null,
    articleLink: row.articleUrl,
    likesWhenSaved: row.likesWhenSaved,
    repostsWhenSaved: row.repostsWhenSaved,
    videoError: row.videoError,
    videoSeconds: row.videoSeconds,
    videoUrl: video[0] ? await getPublicMediaUrl(video[0].storagePath) : null,
    videoCoverUrl: await pictureUrl(row.videoCoverPath),
    transcript: row.transcript ?? [],
    highlights: row.highlights ?? [],
    summary: row.summary ?? [],
    actionPlan: row.actionPlan ?? [],
    suggestedFolder: suggested[0] && suggested[0].id !== row.folderId ? suggested[0] : null,
    similar: similarRow
      ? { id: similarRow.id, title: postTitle(similarRow), savedAt: similarRow.createdAt.toISOString() }
      : null,
    sources: sources
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
      .map((source) => ({ id: source.id, title: postTitle(source) })),
    analysedAt: row.analysedAt?.toISOString() ?? null,
  }
}

// ---------------------------------------------------------------------------
// Analyse

async function checkAiCanRun(ownerId: string) {
  if (!(await getAiKey("gemini"))) throw new Error(NOTE_SAYS.noGeminiKey)
  await checkAiAllowance(ownerId)
}

/** Puts one post in the queue, after the checks. Nothing is spent here. */
async function queuePost(ownerId: string, row: NotePostRow): Promise<NotePostRow> {
  if (isPostAnalysing(row.status)) return row
  const refusal = analyseRefusal({ status: row.status, videoStatus: row.videoStatus, hasText: row.text !== null })
  if (refusal) throw new Error(refusal)
  const [queued] = await db
    .update(notePosts)
    .set({ status: "queued", error: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now() })
    .where(
      and(
        eq(notePosts.id, row.id),
        eq(notePosts.ownerId, ownerId),
        inArray(notePosts.status, ["saved", "ready", "failed"]),
        notInArray(notePosts.videoStatus, ["waiting", "downloading"]),
        isNotNull(notePosts.text)
      )
    )
    .returning()
  // Another press got there first; hand back where it has got to.
  return queued ?? (await requireOwnPost(ownerId, row.id))
}

/**
 * Queues the post for the AI. The Gemini key and the monthly allowance are
 * checked first so a refusal is said at the button, not later on the card.
 */
export async function analysePost(ownerId: string, id: string): Promise<NotePostDetail> {
  const row = await requireOwnPost(ownerId, id)
  if (row.kind === "merged") throw new Error(POST_SAYS.notReadable)
  if (!isPostAnalysing(row.status)) await checkAiCanRun(ownerId)
  return detailFor(await queuePost(ownerId, row))
}

/**
 * Analyse many at once: one request, one check of the key and the allowance,
 * then each post queued or skipped with its reason.
 */
export async function analysePosts(
  ownerId: string,
  ids: string[]
): Promise<{ posts: NotePostCard[]; skipped: { id: string; reason: string }[] }> {
  if (ids.length > MANY_AT_ONCE_MAX) throw new Error(POST_SAYS.tooManyPicked)
  await checkAiCanRun(ownerId)
  const rows = await db
    .select()
    .from(notePosts)
    .where(and(eq(notePosts.ownerId, ownerId), inArray(notePosts.id, ids)))
  const posts: NotePostCard[] = []
  const skipped: { id: string; reason: string }[] = []
  for (const id of ids) {
    const row = rows.find((each) => each.id === id)
    if (!row) {
      skipped.push({ id, reason: POST_SAYS.postNotFound })
      continue
    }
    if (row.kind === "merged") {
      skipped.push({ id, reason: POST_SAYS.notReadable })
      continue
    }
    try {
      posts.push(await cardFor(await queuePost(ownerId, row)))
    } catch (error) {
      skipped.push({ id, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { posts, skipped }
}

/**
 * Try again on a failed post. Words never read are read again; a post that
 * was read goes back in the analysis queue; a merged plan is written again.
 */
export async function retryPost(ownerId: string, id: string): Promise<NotePostDetail> {
  const row = await requireOwnPost(ownerId, id)
  if (row.status !== "failed") return detailFor(row)
  if (row.kind === "post" && row.text !== null) return analysePost(ownerId, id)
  if (row.kind === "merged") await checkAiCanRun(ownerId)
  const [again] = await db
    .update(notePosts)
    .set({
      status: row.kind === "merged" ? "queued" : "waiting",
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId), eq(notePosts.status, "failed")))
    .returning()
  return detailFor(again ?? (await requireOwnPost(ownerId, id)))
}

/** A video that failed to download is fetched again; the words stay as they are. */
export async function retryPostVideo(ownerId: string, id: string): Promise<NotePostDetail> {
  const row = await requireOwnPost(ownerId, id)
  if (row.videoStatus !== "failed" || !row.videoSourceUrl) throw new Error(POST_SAYS.noVideo)
  if (isPostAnalysing(row.status)) throw new Error(POST_SAYS.stillAnalysing)
  const [again] = await db
    .update(notePosts)
    .set({ videoStatus: "waiting", videoError: null, updatedAt: now() })
    .where(
      and(
        eq(notePosts.id, id),
        eq(notePosts.ownerId, ownerId),
        eq(notePosts.videoStatus, "failed"),
        notInArray(notePosts.status, ["queued", "analysing"])
      )
    )
    .returning()
  return detailFor(again ?? (await requireOwnPost(ownerId, id)))
}

/**
 * One plan from many: a new entry in the list, "Plan from 4 posts", that the
 * worker writes from the picked posts' plans. Its posts are kept by id, so
 * deleting one later leaves the merged plan as it is.
 */
export async function mergePlans(ownerId: string, ids: string[]): Promise<NotePostCard> {
  const unique = [...new Set(ids)]
  if (unique.length < 2) throw new Error(POST_SAYS.pickTwo)
  if (unique.length > MANY_AT_ONCE_MAX) throw new Error(POST_SAYS.tooManyPicked)
  const rows = await db
    .select()
    .from(notePosts)
    .where(and(eq(notePosts.ownerId, ownerId), inArray(notePosts.id, unique)))
  if (rows.length !== unique.length) throw new Error(POST_SAYS.postNotFound)
  if (rows.some((row) => row.kind !== "post" || !row.actionPlan?.length)) throw new Error(POST_SAYS.noPlanYet)
  await checkAiCanRun(ownerId)
  const at = now()
  const [created] = await db
    .insert(notePosts)
    .values({
      id: uuid(),
      ownerId,
      kind: "merged",
      status: "queued",
      sourcePostIds: unique,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return cardFor(created)
}

// ---------------------------------------------------------------------------
// Changing

/**
 * Removes the post: its stored pictures, the author's picture, the video's
 * file and cover, then the row. A step that fails stops the rest, so pressing
 * Delete again finishes the job. The original stays on X.
 */
export async function deletePost(ownerId: string, id: string): Promise<void> {
  const row = await requireOwnPost(ownerId, id)
  const paths = [
    ...allPictures(row).map((picture) => picture.path),
    row.authorPicturePath,
    row.videoCoverPath,
  ].filter((path): path is string => Boolean(path))
  const [media] = row.videoMediaId
    ? await db
        .select({
          id: customShellMedia.id,
          storagePath: customShellMedia.storagePath,
          emailProtectedAt: customShellMedia.emailProtectedAt,
        })
        .from(customShellMedia)
        .where(and(eq(customShellMedia.id, row.videoMediaId), eq(customShellMedia.userId, ownerId)))
    : []
  // A file a sent newsletter carries is kept, the shell's own rule for its library.
  const removeFile = media !== undefined && media.emailProtectedAt === null
  if (removeFile) await deleteFromR2(media.storagePath)
  for (const path of new Set(paths)) await deleteFromR2(path)
  if (removeFile) await db.delete(customShellMedia).where(eq(customShellMedia.id, media.id))
  await db.delete(notePosts).where(and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId)))
}

/** Into one folder, or out of every folder with null. Keeping the AI's suggestion clears it. */
export async function movePost(ownerId: string, id: string, folderId: string | null): Promise<NotePostCard> {
  if (folderId) await requireOwnPostFolder(ownerId, folderId)
  const [moved] = await db
    .update(notePosts)
    .set({ folderId, suggestedFolderId: null, updatedAt: now() })
    .where(and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId)))
    .returning()
  if (!moved) throw new Error(POST_SAYS.postNotFound)
  return cardFor(moved)
}

/** The cross on the folder suggestion: it goes, and the post stays where it is. */
export async function dropFolderSuggestion(ownerId: string, id: string): Promise<NotePostDetail> {
  const [dropped] = await db
    .update(notePosts)
    .set({ suggestedFolderId: null, updatedAt: now() })
    .where(and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId)))
    .returning()
  if (!dropped) throw new Error(POST_SAYS.postNotFound)
  return detailFor(dropped)
}

/**
 * The whole plan as the person left it: words edited, steps added, deleted,
 * dragged and ticked. The screen sends one save at a time, each with the plan
 * as it stands, so the last one sent is the one kept.
 */
export async function savePlan(ownerId: string, id: string, steps: PlanStep[]): Promise<NotePostCard> {
  if (steps.length > PLAN_STEPS_MAX) throw new Error(POST_SAYS.tooManySteps)
  const plan = steps.map((step) => {
    const text = step.text.replace(/\s+/g, " ").trim().slice(0, PLAN_STEP_MAX)
    if (!text) throw new Error(POST_SAYS.stepEmpty)
    return step.from ? { text, done: step.done, from: step.from.slice(0, 40) } : { text, done: step.done }
  })
  const row = await requireOwnPost(ownerId, id)
  if (isPostAnalysing(row.status)) throw new Error(POST_SAYS.stillAnalysing)
  const [saved] = await db
    .update(notePosts)
    .set({ actionPlan: plan, updatedAt: now() })
    .where(
      and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId), notInArray(notePosts.status, ["queued", "analysing"]))
    )
    .returning()
  if (!saved) throw new Error(POST_SAYS.stillAnalysing)
  return cardFor(saved)
}

/** The highlights as they now stand. Only ones that fit the post's own words are kept. */
export async function saveHighlights(
  ownerId: string,
  id: string,
  highlights: Highlight[]
): Promise<NotePostCard> {
  const row = await requireOwnPost(ownerId, id)
  const clean = cleanHighlights(highlights, partTextOf(row))
  const [saved] = await db
    .update(notePosts)
    .set({ highlights: clean, updatedAt: now() })
    .where(and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId)))
    .returning()
  if (!saved) throw new Error(POST_SAYS.postNotFound)
  return cardFor(saved)
}

/**
 * "Bring in the article": fetches the page the post links to and keeps its
 * words, so the next Analyse reads them too. Asked for, and waited on.
 */
export async function bringInArticle(ownerId: string, id: string): Promise<NotePostDetail> {
  const row = await requireOwnPost(ownerId, id)
  if (!row.articleUrl) throw new Error(POST_SAYS.noArticle)
  if (isPostAnalysing(row.status)) throw new Error(POST_SAYS.stillAnalysing)
  await enforceRateLimit(`note-post-article:${ownerId}`, ARTICLE_LIMIT)
  const article = await fetchArticle(row.articleUrl)
  const [saved] = await db
    .update(notePosts)
    .set({ articleTitle: article.title, articleText: article.text, updatedAt: now() })
    .where(and(eq(notePosts.id, id), eq(notePosts.ownerId, ownerId)))
    .returning()
  if (!saved) throw new Error(POST_SAYS.postNotFound)
  return detailFor(saved)
}
