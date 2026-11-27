import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { editorGet } from "@/server/social/editor-guards"
import { actorFor, guestProjectView } from "@/server/social/project-guests"
import { readYoutubeModuleView, type YoutubeChannel, type YoutubeModuleView } from "@/server/social/youtube/module"
import { writeYoutubeWords, type YoutubeWords } from "@/server/social/youtube/drafts"
import { readYoutubeSettings, saveYoutubeSettings, type YoutubeSettings } from "@/server/social/youtube/settings"
import {
  arrangeYoutubeTemplates,
  createYoutubeTemplate,
  deleteYoutubeTemplate,
  updateYoutubeTemplate,
  type YoutubeTemplateRow,
} from "@/server/social/youtube/templates"
import { cancelYoutubePosts, queueYoutubeUpload, type YoutubePostRow } from "@/server/social/youtube/uploads"
import { readerWrittenRefusal } from "@/lib/social/refusal-words"
import {
  ABOUT_MAX,
  DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_SECTION_KINDS,
  TEMPLATE_SECTION_NAME_MAX,
  TEMPLATE_SECTION_TEXT_MAX,
  TEMPLATE_SECTIONS_MAX,
  UPLOADS_PER_DAY,
} from "@/lib/social/youtube/options"

import { createErrorMessage } from "../error-message"

export type { YoutubeChannel, YoutubeModuleView, YoutubePostRow, YoutubeSettings, YoutubeTemplateRow, YoutubeWords }

/**
 * YouTube on a project's dashboard and in Settings → Behaviour (YouTube
 * task). Admin only, like every Promo endpoint that writes; a guest sent from
 * Project may look at the module. Write happens in the request, because an
 * AI call takes seconds and the person is watching the boxes; an upload goes
 * on the queue, because it needs the channel's browser or phone.
 */

/** The refusals here are written for the reader and name the channel, the limit or the time, so they pass through as they are. */
const WRITTEN_HERE = [
  "YouTube",
  "Give the video a title",
  "The title is",
  "The description is",
  "The tag",
  "The tags come to",
  "Pick a video",
  "The thumbnail",
  "thumbnail",
  "is retired",
  "hit a ban screen",
  "is paused",
  "project is paused",
  "has no browser profile or phone",
  "already on its way",
  "may upload",
  "Say what the video is about",
  "template",
  "Template",
  "Section",
  "Uploads a day",
  "not there any more",
  "found it broken",
  "cannot do",
]

const lookup = createErrorMessage(
  {
    "key saved": "Add an AI provider key in Settings before asking for words.",
    AI_LIMIT_REACHED: "This month's AI allowance is used up.",
    "project does not exist": "That project is not there any more. Reload the page.",
  },
  "That did not work. Please try again."
)

export function getYoutubeErrorMessage(error: unknown): string {
  const written = readerWrittenRefusal(error)
  if (written) return written
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return WRITTEN_HERE.some((words) => message.includes(words)) ? message : lookup(error)
}

const id = z.string().min(1).max(64)

const moduleFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ context, data }): Promise<YoutubeModuleView> => {
    const actor = await actorFor(context.caller, data.projectId)
    const view = await readYoutubeModuleView(actor.userId, data.projectId)
    return actor.guest ? await guestProjectView(view, data.projectId) : view
  })

/** A project's channels, uploads, comments and templates on YouTube. */
export function loadYoutubeModule(projectId: string) {
  return moduleFn({ data: { projectId } })
}

const wordsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ accountId: id, about: z.string().max(ABOUT_MAX), mediaUrl: z.string().max(2048), templateId: id.nullable() })
  )
  .handler(async ({ context, data }): Promise<YoutubeWords> => writeYoutubeWords(context.user.id, data))

/** Three titles, a description and tags in the channel's voice, for the boxes. Nothing is posted. */
export function writeYoutubeUploadWords(data: { accountId: string; about: string; mediaUrl: string; templateId: string | null }) {
  return wordsFn({ data })
}

const uploadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      accountId: id,
      mediaUrl: z.string().min(1).max(2048),
      title: z.string().max(200),
      description: z.string().max(DESCRIPTION_MAX + 1_000),
      tags: z.string().max(2_000),
      thumbnailUrl: z.string().max(2048),
      aiMade: z.boolean(),
      templateId: id.nullable(),
      draftTitle: z.string().max(200),
      draftDescription: z.string().max(10_000),
    })
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => queueYoutubeUpload(context.user.id, data))

/** Sends one video to the channel's browser or phone to upload. Tried once, never again. */
export function sendYoutubeUpload(data: {
  accountId: string
  mediaUrl: string
  title: string
  description: string
  tags: string
  thumbnailUrl: string
  aiMade: boolean
  templateId: string | null
  draftTitle: string
  draftDescription: string
}) {
  return uploadFn({ data })
}

const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(id).min(1).max(200) }))
  .handler(async ({ context, data }) => cancelYoutubePosts(context.user.id, data.ids))

/** Calls off uploads that have not started, and answers which were. */
export function callOffYoutubeUploads(ids: string[]) {
  return cancelFn({ data: { ids } })
}

const section = z.object({
  name: z.string().max(TEMPLATE_SECTION_NAME_MAX + 20),
  kind: z.enum(TEMPLATE_SECTION_KINDS),
  text: z.string().max(TEMPLATE_SECTION_TEXT_MAX + 100),
})
const sections = z.array(section).max(TEMPLATE_SECTIONS_MAX + 1)

const createTemplateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, name: z.string().max(TEMPLATE_NAME_MAX + 20), sections }))
  .handler(async ({ context, data }): Promise<YoutubeTemplateRow> => createYoutubeTemplate(context.user.id, data))

/** A new description template at the end of the project's list. */
export function newYoutubeTemplate(data: { projectId: string; name: string; sections: Array<{ name: string; kind: "fixed" | "ai"; text: string }> }) {
  return createTemplateFn({ data })
}

const updateTemplateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id, name: z.string().max(TEMPLATE_NAME_MAX + 20).optional(), sections: sections.optional() }))
  .handler(async ({ context, data }): Promise<YoutubeTemplateRow> => updateYoutubeTemplate(context.user.id, data))

/** A template's name or sections, saved as typed. */
export function saveYoutubeTemplate(data: { id: string; name?: string; sections?: Array<{ name: string; kind: "fixed" | "ai"; text: string }> }) {
  return updateTemplateFn({ data })
}

const arrangeTemplatesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, ids: z.array(id).max(200) }))
  .handler(async ({ context, data }): Promise<void> => arrangeYoutubeTemplates(context.user.id, data))

/** The project's templates in a new order. */
export function arrangeYoutubeTemplateOrder(projectId: string, ids: string[]) {
  return arrangeTemplatesFn({ data: { projectId, ids } })
}

const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id }))
  .handler(async ({ context, data }): Promise<void> => deleteYoutubeTemplate(context.user.id, data.id))

/** Deletes a template. Uploads written with it keep their words. */
export function removeYoutubeTemplate(templateId: string) {
  return deleteTemplateFn({ data: { id: templateId } })
}

const settingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<YoutubeSettings> => readYoutubeSettings(context.user.id))

/** YouTube's number in Settings → Behaviour. */
export function loadYoutubeSettings() {
  return settingsFn()
}

const saveSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ uploadsPerDay: z.number().int().min(UPLOADS_PER_DAY.min).max(UPLOADS_PER_DAY.max) }))
  .handler(async ({ context, data }): Promise<YoutubeSettings> => saveYoutubeSettings(context.user.id, data))

/** Saves YouTube's number, and answers what is now stored. */
export function saveYoutubeBehaviour(settings: YoutubeSettings) {
  return saveSettingsFn({ data: settings })
}
