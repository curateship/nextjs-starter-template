import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql, sum } from "drizzle-orm"

import { BIN_DAYS, MAX_ARCHIVE_FILE_BYTES, type ArchiveCaptions, type ArchiveItemKind } from "@/lib/archive/items"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { promoAccounts, promoAppPosts, promoProjects } from "@/server/social/schema"
import { promoLinkedinPosts } from "@/server/social/linkedin/schema"
import { promoXPosts } from "@/server/social/x/schema"

import { archivePath } from "./paths"
import { promoArchiveDrafts, promoArchiveItems, promoArchiveSlides, type PromoArchiveItemRow } from "./schema"
import { bucketStore, copyIntoStore, type ArchiveStore } from "./store"

/**
 * The Archive dashboard's reading and changing (`workspace/docs/archive.md`).
 * Every function takes the owner's id: a guest from Project acts as the
 * project's owner, cut to their one project by the caller.
 */

export const ITEM_NOT_THERE = "That archive item is not there any more."

/** A file's public address, or "" when there is no file or no storage yet. */
async function addressOf(path: string): Promise<string> {
  if (!path) return ""
  try {
    return await getPublicMediaUrl(path)
  } catch {
    return ""
  }
}

export type ArchiveProjectRow = {
  id: string
  name: string
  imageUrl: string
  items: number
  /** Every stored file, Bin included, since the Bin still takes room. */
  bytes: number
}

/** Every project with how many items it holds and how much room they take, biggest first (part 29). */
export async function listArchiveProjects(userId: string, db: CustomShellDb = defaultDb): Promise<ArchiveProjectRow[]> {
  const projects = await db
    .select({ id: promoProjects.id, name: promoProjects.name, imageUrl: promoProjects.imageUrl })
    .from(promoProjects)
    .where(eq(promoProjects.userId, userId))
    .orderBy(asc(promoProjects.name))
  const sizes = await db
    .select({
      projectId: promoArchiveItems.projectId,
      items: sql<number>`count(*) filter (where ${promoArchiveItems.deletedAt} is null)`.mapWith(Number),
      bytes: sum(promoArchiveItems.fileSize).mapWith(Number),
    })
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.userId, userId), eq(promoArchiveItems.status, "ready")))
    .groupBy(promoArchiveItems.projectId)
  const byProject = new Map(sizes.map((row) => [row.projectId, row]))
  return projects
    .map((project) => ({ ...project, items: byProject.get(project.id)?.items ?? 0, bytes: byProject.get(project.id)?.bytes ?? 0 }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
}

export type ArchiveSort = "newest" | "views"

export type ArchiveQuery = {
  projectId: string
  kind?: ArchiveItemKind
  q?: string
  /** Only items never posted anywhere (part 23). */
  notPosted?: boolean
  sort?: ArchiveSort
  /** The project's Bin in place of its items (part 30). */
  bin?: boolean
  /** Only this item, for its own panel. */
  itemId?: string
}

export type ArchiveCard = {
  id: string
  kind: ArchiveItemKind
  status: PromoArchiveItemRow["status"]
  title: string
  coverUrl: string
  aspect: string
  durationMs: number | null
  slides: number
  fileSize: number
  pinned: boolean
  language: string
  groupKey: string
  videoProjectName: string
  posted: number
  views: number
  deletedAt: string | null
  createdAt: string
}

/** How many times each item went out, and the views those posts read, across every network. */
async function postCounts(ids: string[], db: CustomShellDb) {
  const out = new Map<string, { posted: number; views: number }>()
  if (!ids.length) return out
  const add = (id: string | null, posted: number, views: number) => {
    if (!id) return
    const was = out.get(id) ?? { posted: 0, views: 0 }
    out.set(id, { posted: was.posted + posted, views: was.views + views })
  }
  const app = await db
    .select({ id: promoAppPosts.archiveItemId, n: count(), views: sum(promoAppPosts.views).mapWith(Number) })
    .from(promoAppPosts)
    .where(and(inArray(promoAppPosts.archiveItemId, ids), isNotNull(promoAppPosts.postedAt)))
    .groupBy(promoAppPosts.archiveItemId)
  for (const row of app) add(row.id, row.n, row.views ?? 0)
  for (const table of [promoLinkedinPosts, promoXPosts] as const) {
    const rows = await db
      .select({ id: table.archiveItemId, n: count() })
      .from(table)
      .where(and(inArray(table.archiveItemId, ids), isNotNull(table.postedAt)))
      .groupBy(table.archiveItemId)
    for (const row of rows) add(row.id, row.n, 0)
  }
  return out
}

/**
 * One project's items, pinned first, then newest or most viewed (part 24).
 * A newer version still on its way is left out: it lands on the item it
 * replaces (part 18).
 */
export async function listArchiveItems(
  userId: string,
  query: ArchiveQuery,
  db: CustomShellDb = defaultDb
): Promise<{ items: ArchiveCard[]; binCount: number }> {
  const words = query.q?.trim()
  const conditions = [
    eq(promoArchiveItems.userId, userId),
    eq(promoArchiveItems.projectId, query.projectId),
    query.bin ? isNotNull(promoArchiveItems.deletedAt) : isNull(promoArchiveItems.deletedAt),
    sql`(${promoArchiveItems.pending} is null or ${promoArchiveItems.pending}->>'replaceItemId' is null)`,
  ]
  if (query.kind) conditions.push(eq(promoArchiveItems.kind, query.kind))
  if (query.itemId) conditions.push(eq(promoArchiveItems.id, query.itemId))
  if (words) {
    const like = `%${words.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
    const matching = or(ilike(promoArchiveItems.title, like), ilike(promoArchiveItems.caption, like), ilike(promoArchiveItems.description, like))
    if (matching) conditions.push(matching)
  }
  const rows = await db
    .select()
    .from(promoArchiveItems)
    .where(and(...conditions))
    .orderBy(desc(promoArchiveItems.createdAt))
    .limit(500)
  const ids = rows.map((row) => row.id)
  const counts = await postCounts(ids, db)
  const slides = ids.length
    ? await db
        .select({ itemId: promoArchiveSlides.itemId, n: count(), first: sql<string>`min(case when ${promoArchiveSlides.position} = 0 then ${promoArchiveSlides.storagePath} end)` })
        .from(promoArchiveSlides)
        .where(inArray(promoArchiveSlides.itemId, ids))
        .groupBy(promoArchiveSlides.itemId)
    : []
  const slideOf = new Map(slides.map((row) => [row.itemId, row]))
  const [bin] = await db
    .select({ n: count() })
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.userId, userId), eq(promoArchiveItems.projectId, query.projectId), isNotNull(promoArchiveItems.deletedAt)))

  let cards: ArchiveCard[] = await Promise.all(
    rows.map(async (row) => {
      const counted = counts.get(row.id) ?? { posted: 0, views: 0 }
      const slide = slideOf.get(row.id)
      const coverPath = row.coverPath || slide?.first || (row.kind === "picture" ? row.storagePath : "")
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        title: row.title,
        coverUrl: await addressOf(coverPath),
        aspect: row.aspect,
        durationMs: row.durationMs,
        slides: slide?.n ?? 0,
        fileSize: row.fileSize,
        pinned: Boolean(row.pinnedAt),
        language: row.language,
        groupKey: row.groupKey,
        videoProjectName: row.videoProjectName,
        posted: counted.posted,
        views: counted.views,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      }
    })
  )
  if (query.notPosted) cards = cards.filter((card) => card.posted === 0)
  const pinnedAt = new Map(rows.map((row) => [row.id, row.pinnedAt?.getTime() ?? 0]))
  cards.sort((a, b) => {
    // Pinned first under every sort (part 26), the newest pin on top.
    const pins = pinnedAt.get(b.id)! - pinnedAt.get(a.id)!
    if (pins) return pins
    // Items never posted go last when sorted by views (part 24).
    if (query.sort === "views") return b.views - a.views || b.posted - a.posted || b.createdAt.localeCompare(a.createdAt)
    return b.createdAt.localeCompare(a.createdAt)
  })
  return { items: cards, binCount: bin?.n ?? 0 }
}

export type ArchivePost = {
  network: string
  handle: string
  postedAt: string | null
  url: string
  views: number | null
  status: string
}

export type ArchiveItemView = ArchiveCard & {
  projectId: string
  description: string
  caption: string
  captions: ArchiveCaptions
  fileUrl: string
  mimeType: string
  pdfUrl: string
  hasSubtitles: boolean
  width: number | null
  height: number | null
  videoEditUrl: string
  source: PromoArchiveItemRow["source"]
  slideFiles: { url: string; kind: "photo" | "video" }[]
  posts: ArchivePost[]
  drafts: string[]
}

async function ownedItem(userId: string, itemId: string, db: CustomShellDb): Promise<PromoArchiveItemRow> {
  const [row] = await db
    .select()
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.id, itemId), eq(promoArchiveItems.userId, userId)))
    .limit(1)
  if (!row) throw new Error(ITEM_NOT_THERE)
  return row
}

/** The project an item is in, for the guest check before anything is read. */
export async function projectOfItem(itemId: string, db: CustomShellDb = defaultDb): Promise<string | null> {
  const [row] = await db.select({ projectId: promoArchiveItems.projectId }).from(promoArchiveItems).where(eq(promoArchiveItems.id, itemId)).limit(1)
  return row?.projectId ?? null
}

/** One item with its files, where it went out (part 41) and the drafts waiting for it (part 35). */
export async function readArchiveItem(userId: string, itemId: string, db: CustomShellDb = defaultDb): Promise<ArchiveItemView> {
  const row = await ownedItem(userId, itemId, db)
  const { items } = await listArchiveItems(userId, { projectId: row.projectId, bin: Boolean(row.deletedAt), itemId: row.id }, db)
  const card = items.find((item) => item.id === row.id)
  const slides = await db
    .select({ path: promoArchiveSlides.storagePath, kind: promoArchiveSlides.kind })
    .from(promoArchiveSlides)
    .where(eq(promoArchiveSlides.itemId, row.id))
    .orderBy(asc(promoArchiveSlides.position))
  const appPosts = await db
    .select({
      network: promoAppPosts.platform,
      handle: promoAccounts.handle,
      postedAt: promoAppPosts.postedAt,
      url: promoAppPosts.postUrl,
      views: promoAppPosts.views,
      status: promoAppPosts.status,
    })
    .from(promoAppPosts)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoAppPosts.accountId))
    .where(eq(promoAppPosts.archiveItemId, row.id))
    .orderBy(desc(promoAppPosts.createdAt))
  const otherPosts: ArchivePost[] = []
  for (const [network, table] of [
    ["linkedin", promoLinkedinPosts],
    ["x", promoXPosts],
  ] as const) {
    const rows = await db
      .select({ handle: promoAccounts.handle, postedAt: table.postedAt, status: table.status })
      .from(table)
      .leftJoin(promoAccounts, eq(promoAccounts.id, table.accountId))
      .where(eq(table.archiveItemId, row.id))
    for (const post of rows) {
      otherPosts.push({ network, handle: post.handle ?? "", postedAt: post.postedAt?.toISOString() ?? null, url: "", views: null, status: post.status })
    }
  }
  const drafts = await db
    .select({ network: promoArchiveDrafts.network })
    .from(promoArchiveDrafts)
    .where(and(eq(promoArchiveDrafts.itemId, row.id), isNull(promoArchiveDrafts.usedAt)))
  const base: ArchiveCard = card ?? {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    coverUrl: await addressOf(row.coverPath),
    aspect: row.aspect,
    durationMs: row.durationMs,
    slides: slides.length,
    fileSize: row.fileSize,
    pinned: Boolean(row.pinnedAt),
    language: row.language,
    groupKey: row.groupKey,
    videoProjectName: row.videoProjectName,
    posted: 0,
    views: 0,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
  return {
    ...base,
    projectId: row.projectId,
    description: row.description,
    caption: row.caption,
    captions: row.captions,
    fileUrl: await addressOf(row.storagePath),
    mimeType: row.mimeType,
    pdfUrl: await addressOf(row.pdfPath),
    hasSubtitles: Boolean(row.subtitles),
    width: row.width,
    height: row.height,
    videoEditUrl: row.videoEditUrl,
    source: row.source,
    slideFiles: await Promise.all(slides.map(async (slide) => ({ url: await addressOf(slide.path), kind: slide.kind }))),
    posts: [
      ...appPosts.map((post) => ({ ...post, postedAt: post.postedAt?.toISOString() ?? null })),
      ...otherPosts,
    ],
    drafts: drafts.map((draft) => draft.network),
  }
}

export type ArchiveEdit = { title?: string; description?: string; caption?: string; captions?: ArchiveCaptions }

/** Saves the words as they are typed in the item's ⋮. */
export async function updateArchiveItem(userId: string, itemId: string, edit: ArchiveEdit, db: CustomShellDb = defaultDb, now = new Date()) {
  await ownedItem(userId, itemId, db)
  const set: Partial<typeof promoArchiveItems.$inferInsert> = { updatedAt: now }
  if (edit.title !== undefined) set.title = edit.title.trim().slice(0, 200)
  if (edit.description !== undefined) set.description = edit.description
  if (edit.caption !== undefined) set.caption = edit.caption
  if (edit.captions !== undefined) set.captions = edit.captions
  await db.update(promoArchiveItems).set(set).where(eq(promoArchiveItems.id, itemId))
}

/** Pins an item to the top of its project, or takes the pin off (part 26). */
export async function pinArchiveItem(userId: string, itemId: string, pinned: boolean, db: CustomShellDb = defaultDb, now = new Date()) {
  await ownedItem(userId, itemId, db)
  await db.update(promoArchiveItems).set({ pinnedAt: pinned ? now : null, updatedAt: now }).where(eq(promoArchiveItems.id, itemId))
}

/** Moves items to their project's Bin, from which they come back for 30 days (part 30). */
export async function binArchiveItems(userId: string, itemIds: string[], db: CustomShellDb = defaultDb, now = new Date()) {
  if (!itemIds.length) return { binned: 0 }
  const rows = await db
    .update(promoArchiveItems)
    .set({ deletedAt: now, pinnedAt: null, updatedAt: now })
    .where(and(eq(promoArchiveItems.userId, userId), inArray(promoArchiveItems.id, itemIds), eq(promoArchiveItems.status, "ready"), isNull(promoArchiveItems.deletedAt)))
    .returning({ id: promoArchiveItems.id })
  return { binned: rows.length }
}

/** Puts an item back from the Bin. */
export async function restoreArchiveItem(userId: string, itemId: string, db: CustomShellDb = defaultDb, now = new Date()) {
  await ownedItem(userId, itemId, db)
  await db.update(promoArchiveItems).set({ deletedAt: null, updatedAt: now }).where(eq(promoArchiveItems.id, itemId))
}

/** Every stored file an item owns. An upload's file is the media library's, so it is not among them. */
async function ownedPaths(row: PromoArchiveItemRow, db: CustomShellDb): Promise<string[]> {
  if (row.source === "upload") return []
  const slides = await db.select({ path: promoArchiveSlides.storagePath }).from(promoArchiveSlides).where(eq(promoArchiveSlides.itemId, row.id))
  return [row.storagePath, row.coverPath, row.pdfPath, ...slides.map((slide) => slide.path)].filter(Boolean)
}

/** Deletes items and their files for good. A file that won't delete keeps its item, to try again. */
async function deleteForGood(rows: PromoArchiveItemRow[], db: CustomShellDb, store: ArchiveStore): Promise<number> {
  let deleted = 0
  for (const row of rows) {
    try {
      for (const path of await ownedPaths(row, db)) await store.remove(path)
    } catch (error) {
      console.error("An archive file would not delete; its item stays in the Bin", row.id, error)
      continue
    }
    await db.delete(promoArchiveItems).where(eq(promoArchiveItems.id, row.id))
    deleted += 1
  }
  return deleted
}

/** Empty the Bin early, from the item's own ⋮ in the Bin. */
export async function deleteArchiveItemForGood(userId: string, itemId: string, db: CustomShellDb = defaultDb, store: ArchiveStore = bucketStore) {
  const row = await ownedItem(userId, itemId, db)
  if (!row.deletedAt) throw new Error("Move it to the Bin first.")
  if (!(await deleteForGood([row], db, store))) throw new Error("The file could not be deleted from storage. Try again in a minute.")
}

/** The daily pass: items 30 days in the Bin go for good, a bounded number each time. */
export async function emptyOldBins(db: CustomShellDb = defaultDb, store: ArchiveStore = bucketStore, now = new Date()) {
  const old = await db
    .select()
    .from(promoArchiveItems)
    .where(lt(promoArchiveItems.deletedAt, new Date(now.getTime() - BIN_DAYS * 86_400_000)))
    .limit(50)
  return deleteForGood(old, db, store)
}

/** A project of this person's, or a refusal. */
async function ownedProject(userId: string, projectId: string, db: CustomShellDb) {
  const [project] = await db
    .select({ id: promoProjects.id })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error("That project is not there any more.")
}

/** Moves an item to another of this person's projects; its drafts stay with the old project's networks and go (part 27). */
export async function moveArchiveItem(userId: string, itemId: string, projectId: string, db: CustomShellDb = defaultDb, now = new Date()) {
  const row = await ownedItem(userId, itemId, db)
  await ownedProject(userId, projectId, db)
  if (row.projectId === projectId) return
  await db.transaction(async (tx) => {
    await tx.update(promoArchiveItems).set({ projectId, updatedAt: now }).where(eq(promoArchiveItems.id, itemId))
    await tx.delete(promoArchiveDrafts).where(eq(promoArchiveDrafts.itemId, itemId))
  })
}

/**
 * Copies an item into another project as a second item with its own files,
 * so deleting either never breaks the other (part 27). The files are copied
 * through their public addresses into the new item's folder.
 */
export async function copyArchiveItem(
  userId: string,
  itemId: string,
  projectId: string,
  { db = defaultDb, store = bucketStore, fetchImpl = fetch, now = new Date() }: { db?: CustomShellDb; store?: ArchiveStore; fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<string> {
  const row = await ownedItem(userId, itemId, db)
  await ownedProject(userId, projectId, db)
  if (row.status !== "ready") throw new Error("That item is still arriving. Copy it once it is in.")
  const id = uuid()
  const copied: string[] = []
  const copyPath = async (path: string, mimeType: string) => {
    if (!path || row.source === "upload") return path
    const target = archivePath(userId, id, path.split("/").pop() ?? "file")
    await copyIntoStore({ url: await getPublicMediaUrl(path), mimeType, expectedBytes: 0 }, target, {
      store,
      fetchImpl,
      maxBytes: MAX_ARCHIVE_FILE_BYTES,
      timeoutMs: 3 * 3600_000,
    })
    copied.push(target)
    return target
  }
  try {
    const slides = await db.select().from(promoArchiveSlides).where(eq(promoArchiveSlides.itemId, row.id)).orderBy(asc(promoArchiveSlides.position))
    const storagePath = await copyPath(row.storagePath, row.mimeType)
    const coverPath = await copyPath(row.coverPath, row.coverPath.endsWith(".png") ? "image/png" : "image/jpeg")
    const pdfPath = await copyPath(row.pdfPath, "application/pdf")
    const slidePaths: (typeof slides)[number][] = []
    for (const slide of slides) slidePaths.push({ ...slide, storagePath: await copyPath(slide.storagePath, slide.mimeType) })
    await db.transaction(async (tx) => {
      await tx.insert(promoArchiveItems).values({
        ...row,
        id,
        projectId,
        sendId: null,
        storagePath,
        coverPath,
        pdfPath,
        pinnedAt: null,
        deletedAt: null,
        pending: null,
        createdAt: now,
        updatedAt: now,
      })
      if (slidePaths.length) {
        await tx.insert(promoArchiveSlides).values(slidePaths.map((slide) => ({ ...slide, id: uuid(), itemId: id })))
      }
    })
    return id
  } catch (error) {
    for (const path of copied) await store.remove(path).catch(() => undefined)
    throw error instanceof Error && /^[A-Z]/.test(error.message) ? error : new Error("The copy failed. Try again.")
  }
}

/**
 * Puts uploaded media library files, by their addresses from the media
 * picker, into a project's archive (part 28). The file stays the media
 * library's; the item points at it.
 */
export async function addUploadsToArchive(userId: string, projectId: string, mediaUrls: string[], db: CustomShellDb = defaultDb, now = new Date()) {
  await ownedProject(userId, projectId, db)
  const paths = (await Promise.all(mediaUrls.map((url) => storagePathForUrl(url)))).filter((path): path is string => Boolean(path))
  const files = paths.length
    ? await db
        .select()
        .from(customShellMedia)
        .where(and(eq(customShellMedia.userId, userId), inArray(customShellMedia.storagePath, paths)))
    : []
  const usable = files.filter((file) => file.fileType === "image" || file.fileType === "video")
  if (!usable.length) throw new Error("Pick a video or a picture. Sound files don't go in the archive.")
  await db.insert(promoArchiveItems).values(
    usable.map((file) => ({
      id: uuid(),
      userId,
      projectId,
      kind: (file.fileType === "video" ? "video" : "picture") as ArchiveItemKind,
      status: "ready" as const,
      title: file.originalName.replace(/\.[^.]+$/, "").slice(0, 200),
      fileSize: file.fileSize,
      storagePath: file.storagePath,
      mimeType: file.mimeType,
      source: "upload" as const,
      mediaId: file.id,
      createdAt: now,
      updatedAt: now,
    }))
  )
  return { added: usable.length }
}
