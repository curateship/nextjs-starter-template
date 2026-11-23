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
import type { OwnHookType } from "@/lib/viral/hook-types"
import {
  OWN_HOOK_LINK_MAX,
  OWN_HOOK_WORDS_MAX,
  type HookIdeas,
  type HookKind,
  type LibraryHook,
  type OwnLibraryHook,
} from "@/lib/viral/library"
import { SEGMENT_ROLES } from "@/lib/viral/viral-breakdown"
import { VAULT_TAG_MAX, VAULT_TAGS_PER_ITEM_MAX } from "@/lib/viral/vault"
import type { WriterPrice } from "@/lib/viral/writers"
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
import { hookIdeasPrice, listHookIdeas, writeHookIdeas } from "@/server/viral/hook-ideas"
import { listOwnHookTypes } from "@/server/viral/hook-types"
import { listLibraryHooks, setHookTags } from "@/server/viral/library"
import { createOwnHook, deleteOwnHook, updateOwnHook } from "@/server/viral/own-hooks"
import { listVaultTags } from "@/server/viral/vault"
import { writerForPrices } from "@/server/viral/writer-choice"

/**
 * The Library page (`workspace/docs/library.md`): Hooks across every project,
 * and saved Formats with the scripts written from them. Admin only, like
 * every Viral door; the owner always comes from the session.
 */

export type { FormatScript, HookIdeas, LibraryHook, OwnHookType, OwnLibraryHook, ViralFormat }

const id = z.string().min(1).max(36)
const hookKind = z.enum(["video", "own"])
const typeId = z.string().min(1).max(36).nullable()

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const [hooks, formats, tags, hookTypes, writer] = await Promise.all([
      listLibraryHooks(context.user.id),
      listFormats(context.user.id),
      listVaultTags(context.user.id),
      listOwnHookTypes(context.user.id),
      writerForPrices(),
    ])
    const scriptPrice: WriterPrice = { cents: formatScriptPriceCents(writer), writer: writer.label }
    return { hooks, formats, tags, hookTypes, scriptPrice, hookIdeasPrice: hookIdeasPrice(writer) }
  })

/** Everything the Library page draws, in one read. */
export function loadLibrary() {
  return loadFn()
}

const tagsSchema = z.array(z.string().max(VAULT_TAG_MAX)).max(VAULT_TAGS_PER_ITEM_MAX)

const hookTagsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ kind: hookKind, hookId: id, tags: tagsSchema }))
  .handler(async ({ data, context }): Promise<string[]> => setHookTags(context.user.id, data.kind, data.hookId, data.tags))

/** The tags on one hook, an analysed video's or your own, saved as they change. Answers the tags now on it. */
export function saveHookTagsFn(hook: { kind: HookKind; id: string }, tags: string[]) {
  return hookTagsFn({ data: { kind: hook.kind, hookId: hook.id, tags } })
}

const createOwnHookServerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      words: z.string().min(1).max(OWN_HOOK_WORDS_MAX * 2),
      link: z.string().max(OWN_HOOK_LINK_MAX),
      typeId,
      tags: tagsSchema,
    })
  )
  .handler(async ({ data, context }): Promise<OwnLibraryHook> => createOwnHook(context.user.id, data))

/** "+ New hook" on Library → Hooks. */
export function createOwnHookFn(input: { words: string; link: string; typeId: string | null; tags: string[] }) {
  return createOwnHookServerFn({ data: input })
}

const updateOwnHookServerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      hookId: id,
      words: z.string().min(1).max(OWN_HOOK_WORDS_MAX * 2).optional(),
      link: z.string().max(OWN_HOOK_LINK_MAX).optional(),
      typeId: typeId.optional(),
    })
  )
  .handler(async ({ data: { hookId, ...change }, context }): Promise<OwnLibraryHook> => updateOwnHook(context.user.id, hookId, change))

/** One field of your own hook, changed in its ⋮ and saved as it changes. */
export function updateOwnHookFn(hookId: string, change: { words?: string; link?: string; typeId?: string | null }) {
  return updateOwnHookServerFn({ data: { hookId, ...change } })
}

const deleteOwnHookServerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hookId: id }))
  .handler(async ({ data, context }) => {
    await deleteOwnHook(context.user.id, data.hookId)
    return { deleted: true as const }
  })

/** Deletes your own hook and the hooks written from it. */
export function deleteOwnHookFn(hookId: string) {
  return deleteOwnHookServerFn({ data: { hookId } })
}

const hookIdeasFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ kind: hookKind, hookId: id }))
  .handler(async ({ data, context }): Promise<HookIdeas[]> => listHookIdeas(context.user.id, data))

/** The hooks written from one hook, newest first. */
export function loadHookIdeas(hook: { kind: HookKind; id: string }) {
  return hookIdeasFn({ data: { kind: hook.kind, hookId: hook.id } })
}

const writeHookIdeasServerFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ kind: hookKind, hookId: id, projectId: id }))
  .handler(async ({ data, context }): Promise<HookIdeas> => writeHookIdeas(context.user.id, data))

/** Write hooks like this: five hooks in the hook's style for the project's topic, one call on the project's meter. */
export function writeHookIdeasFn(hook: { kind: HookKind; id: string }, projectId: string) {
  return writeHookIdeasServerFn({ data: { kind: hook.kind, hookId: hook.id, projectId } })
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

/** Write a script on Library → Formats: one call to the picked writer, on the project's meter. */
export function writeFromFormatFn(input: { formatId: string; projectId: string; idea: string }) {
  return writeFn({ data: input })
}
