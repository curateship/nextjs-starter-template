import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  FORMAT_IDEA_MAX,
  FORMAT_NAME_MAX,
  FORMAT_PARTS_MAX,
  FORMAT_SUMMARY_MAX,
  type FormatPart,
  type FormatScript,
  type ViralFormat,
} from "@/lib/viral/formats"
import type { LibraryHook } from "@/lib/viral/library"
import { SEGMENT_ROLES } from "@/lib/viral/viral-breakdown"
import { VAULT_TAG_MAX, VAULT_TAGS_PER_ITEM_MAX } from "@/lib/viral/vault"
import { adminGet, adminPost } from "@/server/guards"
import {
  deleteFormat,
  formatScriptPriceCents,
  listFormats,
  listFormatScripts,
  renameFormat,
  saveFormat,
  writeFromFormat,
} from "@/server/viral/formats"
import { listLibraryHooks, setHookTags } from "@/server/viral/library"
import { listVaultTags } from "@/server/viral/vault"

/**
 * The Library page (`workspace/docs/library.md`): Hooks across every project,
 * and saved Formats with the scripts written from them. Admin only, like
 * every Viral door; the owner always comes from the session.
 */

export type { FormatScript, LibraryHook, ViralFormat }

const id = z.string().min(1).max(36)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const [hooks, formats, tags] = await Promise.all([
      listLibraryHooks(context.user.id),
      listFormats(context.user.id),
      listVaultTags(context.user.id),
    ])
    return { hooks, formats, tags, scriptPriceCents: formatScriptPriceCents() }
  })

/** Everything the Library page draws, in one read. */
export function loadLibrary() {
  return loadFn()
}

const hookTagsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ savedVideoId: id, tags: z.array(z.string().max(VAULT_TAG_MAX)).max(VAULT_TAGS_PER_ITEM_MAX) })
  )
  .handler(async ({ data, context }): Promise<string[]> => setHookTags(context.user.id, data.savedVideoId, data.tags))

/** The tags on one hook, saved as they change. Answers the tags now on it. */
export function saveHookTagsFn(savedVideoId: string, tags: string[]) {
  return hookTagsFn({ data: { savedVideoId, tags } })
}

const partSchema = z.object({
  role: z.enum(SEGMENT_ROLES),
  seconds: z.number().int().min(0).max(3_600),
  summary: z.string().max(FORMAT_SUMMARY_MAX),
})

const saveFormatServerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      name: z.string().max(FORMAT_NAME_MAX),
      parts: z.array(partSchema).min(1).max(FORMAT_PARTS_MAX),
      sourceTitle: z.string().max(500).nullable(),
    })
  )
  .handler(async ({ data, context }): Promise<ViralFormat> => saveFormat(context.user.id, data))

/** Save format on an analysis. */
export function saveFormatFn(input: { name: string; parts: FormatPart[]; sourceTitle: string | null }) {
  return saveFormatServerFn({ data: input })
}

const renameFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ formatId: id, name: z.string().min(1).max(FORMAT_NAME_MAX) }))
  .handler(async ({ data, context }): Promise<ViralFormat> => renameFormat(context.user.id, data.formatId, data.name))

export function renameFormatFn(formatId: string, name: string) {
  return renameFn({ data: { formatId, name } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ formatId: id }))
  .handler(async ({ data, context }) => {
    await deleteFormat(context.user.id, data.formatId)
    return { deleted: true as const }
  })

/** Deletes a format and the scripts written from it. */
export function deleteFormatFn(formatId: string) {
  return deleteFn({ data: { formatId } })
}

const scriptsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ formatId: id }))
  .handler(async ({ data, context }): Promise<FormatScript[]> => listFormatScripts(context.user.id, data.formatId))

export function loadFormatScripts(formatId: string) {
  return scriptsFn({ data: { formatId } })
}

const writeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ formatId: id, projectId: id, idea: z.string().min(1).max(FORMAT_IDEA_MAX) }))
  .handler(async ({ data, context }): Promise<FormatScript> => writeFromFormat(context.user.id, data))

/** Write a script on Library → Formats: one Gemini call, on the project's meter. */
export function writeFromFormatFn(input: { formatId: string; projectId: string; idea: string }) {
  return writeFn({ data: input })
}
