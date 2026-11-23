import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { z } from "zod"

import { videoBreakdownCostCents } from "@/lib/video/ai-estimates"
import { BRIEF_PLATFORM_IDS } from "@/lib/video/brief"
import {
  DEFAULT_TEMPLATE_FIELDS,
  TEMPLATE_DESCRIBE_MAX,
  TEMPLATE_INSTRUCTIONS_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_NO_DESCRIPTION_MESSAGE,
  TEMPLATE_NO_NAME_MESSAGE,
  TEMPLATE_NO_TEMPLATE_MESSAGE,
  TEMPLATE_NOT_FOUND_MESSAGE,
  TEMPLATE_PACE_IDS,
  TEMPLATE_REFERENCE_KIND_MESSAGE,
  TEMPLATE_REFERENCES_MAX,
  TEMPLATE_STARTERS,
  TEMPLATE_TOO_MANY_MESSAGE,
  TEMPLATES_MAX,
  cleanTags,
  fitLength,
  readTemplateChanges,
  readTemplateFields,
  typicalTemplateCents,
  withChanges,
  type TemplateChanges,
  type TemplateFields,
  type TemplateFieldsPatch,
  type TemplateReference,
  type TemplateReferenceKind,
} from "@/lib/video/templates"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedMedia } from "@/server/media/library"
import { getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { getOwnedVideo } from "@/server/video/project-videos"
import { videoSpendMetadata } from "@/server/video/project-spend"
import {
  videoBriefs,
  videoProjectVideos,
  videoTemplates,
  videoTemplateStarts,
  videoViralArrivals,
  videoViralVideos,
  type VideoTemplateRow,
} from "@/server/video/schema"
import { parseVideoLink } from "@/server/video/viral/download"
import { readStoredBreakdown } from "@/server/video/viral/analysis"
import { askWriter } from "@/server/video/writer"

/**
 * Templates (`workspace/docs/templates.md`): a person's saved instructions
 * for the AI. This file keeps them: the list with its three starters, saving
 * as the edit dropdown types, references and their breakdowns, and the two
 * ways the AI writes one. Writing a video from a template is Brief to video's
 * job (`briefs.ts`).
 */

/** Where a reference's breakdown is up to, for the row in the edit dropdown. */
export type TemplateReferenceItem = TemplateReference & {
  url_shown: string | null
  state: "ready" | "working" | "failed"
  error: string | null
  /** The breakdown's price, before it runs; null for a picture, which has none. */
  breakdown_cents: number | null
}

export type TemplateItem = {
  id: string
  name: string
  fields: TemplateFields
  tags: string[]
  pinned: boolean
  starter: string | null
  /** A frame from the newest video made with it, or its first reference picture. */
  cover_url: string | null
  /** About what a video made with it costs, in cents (part 24). */
  typical_cents: number
  /** How many briefs were made with it. */
  used: number
  references: TemplateReferenceItem[]
  updated_at: string
}

// ------------------------------------------------------------ Starters ------

/**
 * The three starters, made once per person the first time they open
 * Templates (part 17). A person who deletes them never gets them back,
 * because the row in `video_template_starts` stays.
 */
async function makeStartersOnce(userId: string, database: CustomShellDb) {
  await database.transaction(async (tx) => {
    const [made] = await tx
      .insert(videoTemplateStarts)
      .values({ userId, createdAt: now() })
      .onConflictDoNothing()
      .returning()
    if (!made) return
    const at = now()
    await tx.insert(videoTemplates).values(
      TEMPLATE_STARTERS.map((starter, index) => ({
        id: uuid(),
        userId,
        name: starter.name,
        fields: starter.fields,
        tags: [],
        starter: starter.key,
        createdAt: at,
        // In the starters' own order: the newest first, so Work with me leads.
        updatedAt: new Date(at.getTime() - index),
      }))
    )
  })
}

// ------------------------------------------------------------- Listing ------

function order() {
  return [sql`${videoTemplates.pinnedAt} is null`, asc(videoTemplates.pinnedAt), desc(videoTemplates.updatedAt)]
}

/** Each reference's breakdown state, read from the saved-video rows they name. */
async function referenceItems(
  userId: string,
  rows: VideoTemplateRow[],
  database: CustomShellDb
): Promise<Map<string, TemplateReferenceItem[]>> {
  const fields = new Map(rows.map((row) => [row.id, readTemplateFields(row.fields)]))
  const all = [...fields.values()].flatMap((one) => one.references)
  const savedIds = [...new Set(all.flatMap((ref) => (ref.savedVideoId ? [ref.savedVideoId] : [])))]
  const mediaIds = [...new Set(all.flatMap((ref) => (ref.mediaId ? [ref.mediaId] : [])))]
  const saved = savedIds.length
    ? await database
        .select({
          id: videoViralVideos.id,
          status: videoViralVideos.status,
          error: videoViralVideos.error,
          durationSeconds: videoViralVideos.durationSeconds,
        })
        .from(videoViralVideos)
        .where(and(inArray(videoViralVideos.id, savedIds), eq(videoViralVideos.ownerId, userId)))
    : []
  const media = mediaIds.length
    ? await database
        .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
        .from(customShellMedia)
        .where(and(inArray(customShellMedia.id, mediaIds), eq(customShellMedia.userId, userId)))
    : []
  const urls = new Map(
    await Promise.all(media.map(async (row) => [row.id, await getPublicMediaUrl(row.storagePath)] as const))
  )
  const states = new Map(saved.map((row) => [row.id, row]))
  return new Map(
    [...fields].map(([templateId, one]) => [
      templateId,
      one.references.map((ref): TemplateReferenceItem => {
        const row = ref.savedVideoId ? states.get(ref.savedVideoId) : undefined
        const state =
          ref.kind === "picture" || row?.status === "ready"
            ? "ready"
            : row?.status === "failed" || (ref.savedVideoId && !row)
              ? "failed"
              : "working"
        return {
          ...ref,
          url_shown: ref.mediaId ? (urls.get(ref.mediaId) ?? null) : (ref.url ?? null),
          state,
          error: state === "failed" ? (row?.error ?? "That video is no longer saved. Remove it and add it again.") : null,
          breakdown_cents: ref.kind === "picture" ? null : videoBreakdownCostCents(row?.durationSeconds ?? null),
        }
      }),
    ])
  )
}

/** The newest brief made with each template, for its cover, and how many there are. */
async function usage(userId: string, ids: string[], database: CustomShellDb) {
  if (!ids.length) return new Map<string, { used: number; mediaId: string | null }>()
  const rows = await database
    .select({ templateId: videoBriefs.templateId, scenes: videoBriefs.scenes, createdAt: videoBriefs.createdAt })
    .from(videoBriefs)
    .where(and(eq(videoBriefs.userId, userId), inArray(videoBriefs.templateId, ids)))
    .orderBy(desc(videoBriefs.createdAt))
  const found = new Map<string, { used: number; mediaId: string | null }>()
  for (const row of rows) {
    if (!row.templateId) continue
    const seen = found.get(row.templateId)
    const still = row.scenes.find((scene) => scene.still)?.still?.mediaId ?? null
    if (!seen) found.set(row.templateId, { used: 1, mediaId: still })
    else found.set(row.templateId, { used: seen.used + 1, mediaId: seen.mediaId ?? still })
  }
  return found
}

async function serializeTemplates(
  userId: string,
  rows: VideoTemplateRow[],
  database: CustomShellDb = db
): Promise<TemplateItem[]> {
  const [references, used] = await Promise.all([
    referenceItems(userId, rows, database),
    usage(
      userId,
      rows.map((row) => row.id),
      database
    ),
  ])
  const coverIds = [...new Set([...used.values()].flatMap((one) => (one.mediaId ? [one.mediaId] : [])))]
  const covers = coverIds.length
    ? await database
        .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
        .from(customShellMedia)
        .where(and(inArray(customShellMedia.id, coverIds), eq(customShellMedia.userId, userId)))
    : []
  const coverUrls = new Map(
    await Promise.all(covers.map(async (row) => [row.id, await getPublicMediaUrl(row.storagePath)] as const))
  )
  return rows.map((row) => {
    const fields = readTemplateFields(row.fields)
    const refs = references.get(row.id) ?? []
    const usedBy = used.get(row.id)
    const madeCover = usedBy?.mediaId ? coverUrls.get(usedBy.mediaId) : undefined
    const pictureCover = refs.find((ref) => ref.kind === "picture" && ref.url_shown)?.url_shown
    return {
      id: row.id,
      name: row.name,
      fields,
      tags: row.tags ?? [],
      pinned: !!row.pinnedAt,
      starter: row.starter,
      cover_url: madeCover ?? pictureCover ?? null,
      typical_cents: typicalTemplateCents(fields),
      used: usedBy?.used ?? 0,
      references: refs,
      updated_at: row.updatedAt.toISOString(),
    }
  })
}

/** This person's templates, pinned first, then the latest edited. The starters are made on the first call. */
export async function listTemplates(userId: string, database: CustomShellDb = db) {
  await makeStartersOnce(userId, database)
  const rows = await database
    .select()
    .from(videoTemplates)
    .where(eq(videoTemplates.userId, userId))
    .orderBy(...order())
    .limit(TEMPLATES_MAX)
  return { templates: await serializeTemplates(userId, rows, database) }
}

export async function ownedTemplate(userId: string, templateId: string, database: CustomShellDb = db) {
  const [row] = await database
    .select()
    .from(videoTemplates)
    .where(and(eq(videoTemplates.id, templateId), eq(videoTemplates.userId, userId)))
    .limit(1)
  if (!row) throw new Error(TEMPLATE_NOT_FOUND_MESSAGE)
  return row
}

async function oneItem(userId: string, row: VideoTemplateRow, database: CustomShellDb) {
  return (await serializeTemplates(userId, [row], database))[0]
}

// -------------------------------------------------------------- Saving ------

function cleanName(name: string) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, TEMPLATE_NAME_MAX)
  if (!clean) throw new Error(TEMPLATE_NO_NAME_MESSAGE)
  return clean
}

async function requireRoom(userId: string, database: CustomShellDb) {
  const [counted] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(videoTemplates)
    .where(eq(videoTemplates.userId, userId))
  if ((counted?.total ?? 0) >= TEMPLATES_MAX) throw new Error(TEMPLATE_TOO_MANY_MESSAGE)
}

async function insertTemplate(
  userId: string,
  name: string,
  fields: TemplateFields,
  database: CustomShellDb,
  tags: string[] = []
) {
  await requireRoom(userId, database)
  const at = now()
  const [row] = await database
    .insert(videoTemplates)
    .values({ id: uuid(), userId, name: cleanName(name), fields, tags: cleanTags(tags), createdAt: at, updatedAt: at })
    .returning()
  return row
}

/**
 * A field that names another of the person's things must name their own: an
 * actor, an intro or outro video, or a music track. Anything else is refused
 * rather than kept.
 */
async function checkOwnedPicks(userId: string, patch: TemplateFieldsPatch) {
  const files: [string | null | undefined, string][] = [
    [patch.introMediaId, "video"],
    [patch.outroMediaId, "video"],
    [patch.music?.kind === "track" ? patch.music.mediaId : null, "audio"],
  ]
  for (const [mediaId, fileType] of files) {
    if (!mediaId) continue
    const media = await getOwnedMedia(userId, mediaId)
    if (media.fileType !== fileType) throw new Error(TEMPLATE_REFERENCE_KIND_MESSAGE)
  }
  if (patch.actorId) {
    const { requireOwnedActor } = await import("@/server/video/asset-factories/actors")
    await requireOwnedActor(userId, patch.actorId)
  }
}

/**
 * Saves what the edit dropdown changed: the name, some fields, the tags or
 * the pin. References change only through their own two calls, so a field
 * save never drops one that is still being broken down.
 */
export async function updateTemplate(
  userId: string,
  payload: {
    templateId: string
    name?: string
    fields?: TemplateFieldsPatch
    tags?: string[]
    pinned?: boolean
  },
  database: CustomShellDb = db
) {
  const row = await ownedTemplate(userId, payload.templateId, database)
  const { references: _references, ...patch } = payload.fields ?? {}
  await checkOwnedPicks(userId, patch)
  const current = readTemplateFields(row.fields)
  const merged = { ...current, ...patch }
  const fields: TemplateFields = { ...merged, lengthSeconds: fitLength(merged.lengthSeconds, merged.platform) }
  const [saved] = await database
    .update(videoTemplates)
    .set({
      ...(payload.name !== undefined ? { name: cleanName(payload.name) } : {}),
      ...(payload.fields ? { fields } : {}),
      ...(payload.tags ? { tags: cleanTags(payload.tags) } : {}),
      ...(payload.pinned !== undefined ? { pinnedAt: payload.pinned ? (row.pinnedAt ?? now()) : null } : {}),
      updatedAt: now(),
    })
    .where(and(eq(videoTemplates.id, row.id), eq(videoTemplates.userId, userId)))
    .returning()
  return oneItem(userId, saved, database)
}

/** Duplicate (part 20): "Copy of Work with me", every field and tag, never pinned. */
export async function duplicateTemplate(userId: string, templateId: string, database: CustomShellDb = db) {
  const row = await ownedTemplate(userId, templateId, database)
  const copy = await insertTemplate(
    userId,
    `Copy of ${row.name}`.slice(0, TEMPLATE_NAME_MAX),
    readTemplateFields(row.fields),
    database,
    row.tags ?? []
  )
  return oneItem(userId, copy, database)
}

/** Deletes it. Briefs made with it keep their copy; videos that picked it pick nothing. */
export async function deleteTemplate(userId: string, templateId: string, database: CustomShellDb = db) {
  const row = await ownedTemplate(userId, templateId, database)
  await database.delete(videoTemplates).where(and(eq(videoTemplates.id, row.id), eq(videoTemplates.userId, userId)))
  return { deleted: row.id }
}

/** A blank template: the defaults, under the name typed. */
export async function createTemplate(userId: string, name: string, database: CustomShellDb = db) {
  const row = await insertTemplate(userId, name, DEFAULT_TEMPLATE_FIELDS, database)
  return oneItem(userId, row, database)
}

// ---------------------------------------------------------- References ------

/**
 * The saved-video row a video reference is broken down on. A file already in
 * the library goes straight to the breakdown; a link is downloaded first.
 * The same video twice shares one row, so it is never paid for twice.
 */
async function savedVideoFor(
  userId: string,
  source: { mediaId: string; name: string } | { url: string },
  database: CustomShellDb
) {
  const at = now()
  const values =
    "url" in source
      ? (() => {
          const link = parseVideoLink(source.url)
          return {
            platform: link.platform,
            platformVideoId: link.platformVideoId,
            sourceUrl: source.url.trim(),
            mediaId: null,
            title: null,
          }
        })()
      : { platform: "upload", platformVideoId: source.mediaId, sourceUrl: "", mediaId: source.mediaId, title: source.name }
  const [row] = await database
    .insert(videoViralVideos)
    .values({
      id: uuid(),
      ownerId: userId,
      ...values,
      status: "waiting",
      wantsAnalysis: true,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [videoViralVideos.ownerId, videoViralVideos.platform, videoViralVideos.platformVideoId],
      // A row that was only downloaded, or failed, is asked again; a ready one stays ready.
      set: {
        wantsAnalysis: true,
        status: sql`case when ${videoViralVideos.status} in ('downloaded', 'failed') then 'waiting' else ${videoViralVideos.status} end`,
        updatedAt: at,
      },
    })
    .returning({ id: videoViralVideos.id, status: videoViralVideos.status })
  return row
}

/** The Viral originals this person has had sent in (viral-connection.md), newest first. */
export async function listViralOriginals(userId: string, database: CustomShellDb = db) {
  const rows = await database
    .select({ mediaId: videoViralArrivals.mediaId, name: customShellMedia.originalName })
    .from(videoViralArrivals)
    .innerJoin(customShellMedia, eq(customShellMedia.id, videoViralArrivals.mediaId))
    .where(
      and(
        eq(videoViralArrivals.userId, userId),
        isNotNull(videoViralArrivals.mediaId),
        eq(customShellMedia.userId, userId)
      )
    )
    .orderBy(desc(videoViralArrivals.createdAt))
    .limit(50)
  const seen = new Set<string>()
  return {
    originals: rows.flatMap((row) => {
      if (!row.mediaId || seen.has(row.mediaId)) return []
      seen.add(row.mediaId)
      return [{ mediaId: row.mediaId, name: row.name }]
    }),
  }
}

/**
 * Adds a reference (part 8). A picture must be one of the person's pictures.
 * A video or a Viral original must be one of their videos, and a link must
 * be a YouTube, TikTok or Instagram video; those three are queued for the
 * breakdown, which the saved-video job runs on its next pass.
 */
export async function addTemplateReference(
  userId: string,
  payload: { templateId: string; kind: TemplateReferenceKind; mediaId?: string; url?: string },
  database: CustomShellDb = db
) {
  const row = await ownedTemplate(userId, payload.templateId, database)
  const fields = readTemplateFields(row.fields)
  if (fields.references.length >= TEMPLATE_REFERENCES_MAX) {
    throw new Error(`A template holds up to ${TEMPLATE_REFERENCES_MAX} references.`)
  }
  let reference: TemplateReference
  if (payload.kind === "link") {
    if (!payload.url) throw new Error(TEMPLATE_REFERENCE_KIND_MESSAGE)
    const saved = await savedVideoFor(userId, { url: payload.url }, database)
    reference = { id: uuid(), kind: "link", name: payload.url.slice(0, 200), url: payload.url, savedVideoId: saved.id }
  } else {
    if (!payload.mediaId) throw new Error(TEMPLATE_REFERENCE_KIND_MESSAGE)
    const media = await getOwnedMedia(userId, payload.mediaId)
    const wanted = payload.kind === "picture" ? "image" : "video"
    if (media.fileType !== wanted) throw new Error(TEMPLATE_REFERENCE_KIND_MESSAGE)
    const name = media.originalName.slice(0, 200)
    reference = { id: uuid(), kind: payload.kind, name, mediaId: media.id }
    if (payload.kind !== "picture") {
      const saved = await savedVideoFor(userId, { mediaId: media.id, name }, database)
      reference.savedVideoId = saved.id
    }
  }
  const [saved] = await database
    .update(videoTemplates)
    .set({ fields: { ...fields, references: [...fields.references, reference] }, updatedAt: now() })
    .where(eq(videoTemplates.id, row.id))
    .returning()
  return oneItem(userId, saved, database)
}

export async function removeTemplateReference(
  userId: string,
  payload: { templateId: string; referenceId: string },
  database: CustomShellDb = db
) {
  const row = await ownedTemplate(userId, payload.templateId, database)
  const fields = readTemplateFields(row.fields)
  const [saved] = await database
    .update(videoTemplates)
    .set({
      fields: { ...fields, references: fields.references.filter((ref) => ref.id !== payload.referenceId) },
      updatedAt: now(),
    })
    .where(eq(videoTemplates.id, row.id))
    .returning()
  return oneItem(userId, saved, database)
}

/**
 * What the AI is told about the template's reference videos: each finished
 * breakdown as its parts and what is said, in time order. A breakdown still
 * running, or failed, is left out and named, so the AI never pretends to
 * have watched it.
 */
export async function referenceNotes(userId: string, fields: TemplateFields, database: CustomShellDb = db) {
  const ids = fields.references.flatMap((ref) => (ref.savedVideoId ? [ref.savedVideoId] : []))
  if (!ids.length) return { notes: "", waiting: [] as string[] }
  const rows = await database
    .select({ id: videoViralVideos.id, breakdown: videoViralVideos.breakdown, status: videoViralVideos.status })
    .from(videoViralVideos)
    .where(and(inArray(videoViralVideos.id, ids), eq(videoViralVideos.ownerId, userId)))
  const byId = new Map(rows.map((row) => [row.id, row]))
  const waiting: string[] = []
  const notes = fields.references.flatMap((ref, index) => {
    if (!ref.savedVideoId) return []
    const breakdown = readStoredBreakdown(byId.get(ref.savedVideoId)?.breakdown)
    if (!breakdown) {
      waiting.push(ref.name)
      return []
    }
    const seconds = (ms: number) => `${Math.round(ms / 1000)}s`
    const parts = breakdown.segments.map((part) => `  ${seconds(part.startMs)}-${seconds(part.endMs)} ${part.role}: ${part.summary}`)
    const said = breakdown.transcript
      .slice(0, 40)
      .map((line) => line.text)
      .join(" ")
      .slice(0, 1_500)
    return [
      `Reference video ${index + 1} ("${ref.name}"), ${breakdown.scenes.length} shots:\n${parts.join("\n")}${said ? `\n  What is said: ${said}` : ""}`,
    ]
  })
  return { notes: notes.join("\n\n"), waiting }
}

// ------------------------------------------------- The AI writes it ------

const writtenTemplateSchema = z.object({
  name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX),
  instructions: z.string().trim().min(1).max(TEMPLATE_INSTRUCTIONS_MAX),
  platform: z.enum(BRIEF_PLATFORM_IDS),
  lengthSeconds: z.number().int().positive().max(1_800),
  audience: z.string().max(300),
  pace: z.enum(TEMPLATE_PACE_IDS),
})

const TEMPLATE_ANSWER_SHAPE = `{
  "name": "a short name for the template, four words at most",
  "instructions": "what this kind of video is, how it opens, how it is told and how it ends, what the pictures look like, and any rule every script must keep, in plain words the AI will follow every time",
  "platform": "shorts" | "tiktok" | "reels" | "youtube",
  "lengthSeconds": 45,
  "audience": "who it is for, a few words",
  "pace": "fast" | "normal" | "slow"
}`

function templateWriterPrompt(source: string) {
  return `Write a template for short social videos. A template is a set of instructions an AI follows every time it turns somebody's script or idea into a video of this kind.

${source}

Answer with JSON only, in exactly this shape, and nothing else:
${TEMPLATE_ANSWER_SHAPE}

Rules:
- The instructions speak to the AI that will write the scenes, in the second person is fine, and run to at most eight sentences. End them with one sentence on how every picture looks: light, colour, framing, photo or illustration.
- "fast" is 2 to 4 seconds a scene, "normal" 3 to 8, "slow" 8 to 15.
- A short platform runs 15 to 180 seconds; YouTube up to 1,800.`
}

function fromAnswer(answer: z.infer<typeof writtenTemplateSchema>): { name: string; fields: TemplateFields } {
  return {
    name: answer.name,
    fields: {
      ...DEFAULT_TEMPLATE_FIELDS,
      instructions: answer.instructions,
      platform: answer.platform,
      lengthSeconds: fitLength(answer.lengthSeconds, answer.platform),
      audience: answer.audience.trim(),
      pace: answer.pace,
    },
  }
}

/** Write it with AI (part 18): one sentence in, every field drafted. About a cent. */
export async function writeTemplateWithAi(
  userId: string,
  payload: { name: string; describe: string },
  database: CustomShellDb = db
) {
  const describe = payload.describe.trim().slice(0, TEMPLATE_DESCRIBE_MAX)
  if (!describe) throw new Error(TEMPLATE_NO_DESCRIPTION_MESSAGE)
  await requireRoom(userId, database)
  const answer = await askWriter({
    userId,
    feature: "template_writer",
    metadata: { characters: describe.length },
    prompt: templateWriterPrompt(`What it is for, in the person's words: ${describe}`),
    schema: writtenTemplateSchema,
    label: "Template writer",
    timeoutMs: 120_000,
  })
  const written = fromAnswer(answer)
  const row = await insertTemplate(userId, payload.name.trim() || written.name, written.fields, database)
  return oneItem(userId, row, database)
}

/**
 * From a video (part 19): the AI writes a template from a finished video in
 * the project, from its script, length and shots, or from a reference video
 * whose breakdown is ready.
 */
export async function templateFromVideo(
  userId: string,
  payload: { name: string; videoId?: string; savedVideoId?: string },
  database: CustomShellDb = db
) {
  await requireRoom(userId, database)
  let source: string
  let spend: Record<string, unknown> = {}
  if (payload.videoId) {
    const video = await getOwnedVideo(userId, payload.videoId, database)
    const { videoScript } = await import("@/server/video/carousel-writer")
    const script = await videoScript(userId, video.id, database)
    const seconds = Math.round(video.durationMs / 1000)
    source = `The video it is written from, "${video.name}", runs ${seconds} seconds on a ${video.aspect} screen and has ${video.clipCount} clips. What it says:\n${JSON.stringify(script.words.slice(0, 8_000))}`
    spend = videoSpendMetadata(video)
  } else if (payload.savedVideoId) {
    const [row] = await database
      .select()
      .from(videoViralVideos)
      .where(and(eq(videoViralVideos.id, payload.savedVideoId), eq(videoViralVideos.ownerId, userId)))
      .limit(1)
    const breakdown = readStoredBreakdown(row?.breakdown)
    if (!row || !breakdown) throw new Error("That reference hasn't been broken down yet. Wait for it to say Ready.")
    const parts = breakdown.segments.map((part) => `${part.role}: ${part.summary}`).join("\n")
    const said = breakdown.transcript.map((line) => line.text).join(" ").slice(0, 6_000)
    source = `The video it is written from runs ${row.durationSeconds ?? "an unknown number of"} seconds and has ${breakdown.scenes.length} shots. How it is built, part by part:\n${parts}\nWhat it says: ${JSON.stringify(said)}`
  } else {
    throw new Error("Pick the video to write the template from.")
  }
  const answer = await askWriter({
    userId,
    feature: "template_from_video",
    metadata: spend,
    prompt: templateWriterPrompt(
      `${source}\n\nWrite the template so the AI can make new videos in the same format about other subjects. Describe the format, never this video's own subject.`
    ),
    schema: writtenTemplateSchema,
    label: "Template writer",
    timeoutMs: 120_000,
  })
  const written = fromAnswer(answer)
  const row = await insertTemplate(userId, payload.name.trim() || written.name, written.fields, database)
  return oneItem(userId, row, database)
}

// ------------------------------------------------------ A video's card ------

export type VideoTemplateCard = {
  video_id: string
  template_id: string | null
  script: string
  changes: TemplateChanges
  /** The script a Viral draft arrived with, which fills an empty script box (part 29). */
  viral_script: string | null
}

function cardFor(row: typeof videoProjectVideos.$inferSelect): VideoTemplateCard {
  return {
    video_id: row.id,
    template_id: row.templateId,
    script: row.templateScript ?? row.viralScript ?? "",
    changes: readTemplateChanges(row.templateChanges),
    viral_script: row.viralScript,
  }
}

/** What the Templates panel's "This video" card holds for a video. */
export async function getVideoTemplateCard(userId: string, videoId: string, database: CustomShellDb = db) {
  return cardFor(await getOwnedVideo(userId, videoId, database))
}

/**
 * Saves the card as it is typed: the template picked, the script box and
 * this video's own settings. Picking a template copies every one of its
 * settings onto the video, replacing what the video had; picking none clears
 * them (templates.md). Changes sent afterwards change the video's copy only,
 * never the template. None of it is part of the timeline, so the video's
 * version never moves and an open editor keeps saving.
 */
export async function saveVideoTemplateCard(
  userId: string,
  payload: { videoId: string; templateId?: string | null; script?: string; changes?: TemplateChanges },
  database: CustomShellDb = db
) {
  const video = await getOwnedVideo(userId, payload.videoId, database)
  const template = payload.templateId ? await ownedTemplate(userId, payload.templateId, database) : null
  const copied =
    payload.templateId === undefined ? undefined : template ? readTemplateFields(template.fields) : null
  // A video's references come from its template when it is picked; its own
  // settings window has no references card, so none is taken from here. An
  // actor, intro, outro or music track must be the person's own, as on the
  // template itself.
  let changes: TemplateChanges | undefined
  if (payload.changes !== undefined) {
    const { references: _references, ...rest } = readTemplateChanges(payload.changes)
    await checkOwnedPicks(userId, rest)
    changes = rest
  }
  const [saved] = await database
    .update(videoProjectVideos)
    .set({
      ...(payload.templateId !== undefined ? { templateId: payload.templateId, templateChanges: copied } : {}),
      ...(payload.script !== undefined ? { templateScript: payload.script } : {}),
      ...(changes !== undefined
        ? { templateChanges: { ...readTemplateChanges(video.templateChanges), ...(copied ?? {}), ...changes } }
        : {}),
    })
    .where(and(eq(videoProjectVideos.id, video.id), eq(videoProjectVideos.userId, userId)))
    .returning()
  return cardFor(saved)
}

/**
 * The template a video uses and the settings it makes with: the video's own
 * copy, over the template's for anything a video picked before copies
 * existed lacks. A refusal names what is missing.
 */
export async function templateForVideo(userId: string, videoId: string, database: CustomShellDb = db) {
  const video = await getOwnedVideo(userId, videoId, database)
  if (!video.templateId) throw new Error(TEMPLATE_NO_TEMPLATE_MESSAGE)
  const row = await ownedTemplate(userId, video.templateId, database)
  const fields = withChanges(readTemplateFields(row.fields), readTemplateChanges(video.templateChanges))
  return { video, row, fields }
}
