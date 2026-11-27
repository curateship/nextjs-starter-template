import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getBriefErrorMessage } from "@/lib/api/video/briefs"
import { CAROUSEL_FORMATS, type CarouselFormat } from "@/lib/video/carousel-schema"
import { CAROUSEL_SLIDE_COUNT } from "@/lib/video/carousel-writing"
import { BRIEF_SCENES_MAX } from "@/lib/video/brief"
import {
  TEMPLATE_DESCRIBE_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_REFERENCE_KINDS,
  TEMPLATE_SCRIPT_MAX,
  isTemplateRefusal,
  templateChangesSchema,
  templateFieldsPatchSchema,
  templateTagsSchema,
  type TemplateChanges,
  type TemplateFieldsPatch,
  type TemplateReferenceKind,
} from "@/lib/video/templates"
import { userGet, userPost } from "@/server/guards"
import type { BriefItem } from "@/server/video/briefs"
import type { TemplateItem, TemplateReferenceItem, VideoTemplateCard } from "@/server/video/templates"

export type { TemplateItem, TemplateReferenceItem, VideoTemplateCard }

/**
 * The Templates panel's calls (`workspace/docs/templates.md`): the list and
 * the edit dropdown, a video's card, and the AI presses on both.
 */

const idSchema = z.string().min(1).max(36)
const nameSchema = z.string().max(TEMPLATE_NAME_MAX * 2)
const scriptSchema = z.string().max(TEMPLATE_SCRIPT_MAX)

/** A template's own refusals, and the brief's, as they are; everything else as the AI tools say it. */
export function getTemplateErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (isTemplateRefusal(message)) return message
  return getBriefErrorMessage(error)
}

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => import("@/server/video/templates").then((m) => m.listTemplates(context.user.id)))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("start", [
      z.object({ start: z.literal("blank"), name: nameSchema }),
      z.object({ start: z.literal("ai"), name: nameSchema, describe: z.string().max(TEMPLATE_DESCRIBE_MAX * 2) }),
      z.object({ start: z.literal("video"), name: nameSchema, videoId: idSchema }),
      z.object({ start: z.literal("reference"), name: nameSchema, savedVideoId: idSchema }),
    ])
  )
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => {
      if (data.start === "blank") return m.createTemplate(context.user.id, data.name)
      if (data.start === "ai") return m.writeTemplateWithAi(context.user.id, data)
      if (data.start === "video") return m.templateFromVideo(context.user.id, { name: data.name, videoId: data.videoId })
      return m.templateFromVideo(context.user.id, { name: data.name, savedVideoId: data.savedVideoId })
    })
  )

const updateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      templateId: idSchema,
      name: nameSchema.optional(),
      fields: templateFieldsPatchSchema.optional(),
      tags: templateTagsSchema.optional(),
      pinned: z.boolean().optional(),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => m.updateTemplate(context.user.id, data))
  )

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ templateId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => m.duplicateTemplate(context.user.id, data.templateId))
  )

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ templateId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => m.deleteTemplate(context.user.id, data.templateId))
  )

const addReferenceFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      templateId: idSchema,
      kind: z.enum(TEMPLATE_REFERENCE_KINDS),
      mediaId: idSchema.optional(),
      url: z.string().trim().url().max(2_048).optional(),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => m.addTemplateReference(context.user.id, data))
  )

const removeReferenceFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ templateId: idSchema, referenceId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => m.removeTemplateReference(context.user.id, data))
  )

const originalsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => import("@/server/video/templates").then((m) => m.listViralOriginals(context.user.id)))

const cardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ videoId: idSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => m.getVideoTemplateCard(context.user.id, data.videoId))
  )

const saveCardFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: idSchema,
      templateId: idSchema.nullable().optional(),
      script: scriptSchema.optional(),
      changes: templateChangesSchema.optional(),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/templates").then((m) => m.saveVideoTemplateCard(context.user.id, data))
  )

const writeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ videoId: idSchema, text: scriptSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.writeTemplateBrief(context.user.id, data))
  )

const previewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ templateId: idSchema, videoId: idSchema.optional() }))
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.templatePromptPreview(context.user.id, data))
  )

const tryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ templateId: idSchema, videoId: idSchema, script: scriptSchema }))
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.tryTemplate(context.user.id, data))
  )

const remakeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      briefId: idSchema,
      scenes: z.array(z.object({ id: idSchema, words: z.string().max(2_000) })).min(1).max(BRIEF_SCENES_MAX),
    })
  )
  .handler(({ data, context }) =>
    import("@/server/video/briefs").then((m) => m.remakeChangedScenes(context.user.id, data))
  )

const carouselFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: idSchema,
      carouselProjectId: idSchema,
      script: z.string().trim().min(1).max(20_000),
      slideCount: z.number().int().min(CAROUSEL_SLIDE_COUNT.min).max(CAROUSEL_SLIDE_COUNT.max),
      format: z.enum(CAROUSEL_FORMATS),
    })
  )
  .handler(async ({ data, context }) => {
    // The video must be the caller's: its project is written on the carousel.
    const { getOwnedVideo } = await import("@/server/video/project-videos")
    const video = await getOwnedVideo(context.user.id, data.videoId)
    const { writeCarouselDraft } = await import("@/server/video/carousel-writer")
    return writeCarouselDraft({
      userId: context.user.id,
      carouselProjectId: data.carouselProjectId,
      source: { kind: "notes", text: data.script },
      slideCount: data.slideCount,
      format: data.format,
      madeFromProjectId: video.projectId,
    })
  })

/** This person's templates, pinned first. The three starters are made on the first call. */
export function listTemplates() {
  return listFn()
}
/** A new template: blank, written by the AI from a sentence, or written from a video or a reference. */
export function createTemplate(
  data:
    | { start: "blank"; name: string }
    | { start: "ai"; name: string; describe: string }
    | { start: "video"; name: string; videoId: string }
    | { start: "reference"; name: string; savedVideoId: string }
) {
  return createFn({ data })
}
/** Saves what the edit dropdown changed. */
export function updateTemplate(data: {
  templateId: string
  name?: string
  fields?: TemplateFieldsPatch
  tags?: string[]
  pinned?: boolean
}) {
  return updateFn({ data })
}
export function duplicateTemplate(templateId: string) {
  return duplicateFn({ data: { templateId } })
}
export function deleteTemplate(templateId: string) {
  return deleteFn({ data: { templateId } })
}
export function addTemplateReference(data: {
  templateId: string
  kind: TemplateReferenceKind
  mediaId?: string
  url?: string
}) {
  return addReferenceFn({ data })
}
export function removeTemplateReference(templateId: string, referenceId: string) {
  return removeReferenceFn({ data: { templateId, referenceId } })
}
/** The videos Viral has sent in, for a Viral original reference. */
export function listViralOriginals() {
  return originalsFn()
}
/** The "This video" card: the template picked, the script box and this video's changes. */
export function loadVideoTemplateCard(videoId: string) {
  return cardFn({ data: { videoId } })
}
export function saveVideoTemplateCard(data: {
  videoId: string
  templateId?: string | null
  script?: string
  changes?: TemplateChanges
}) {
  return saveCardFn({ data })
}
/** Brief to video from the card: the storyboard, written and checked. */
export function writeTemplateBrief(data: { videoId: string; text: string }): Promise<BriefItem> {
  return writeFn({ data })
}
/** The app's own Instructions, for the Instructions card to start on. */
export function previewTemplatePrompt(data: { templateId: string; videoId?: string }) {
  return previewFn({ data })
}
/** A sample script to the storyboard only, saved nowhere. */
export function tryTemplate(data: { templateId: string; videoId: string; script: string }) {
  return tryFn({ data })
}
export function remakeChangedScenes(briefId: string, scenes: { id: string; words: string }[]) {
  return remakeFn({ data: { briefId, scenes } })
}
export function carouselFromScript(data: {
  videoId: string
  carouselProjectId: string
  script: string
  slideCount: number
  format: CarouselFormat
}) {
  return carouselFn({ data })
}
