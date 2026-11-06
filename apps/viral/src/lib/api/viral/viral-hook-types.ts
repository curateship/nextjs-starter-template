import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { HOOK_TYPE_NAME_MAX } from "@/lib/viral/hook-types"
import { adminGet, adminPost } from "@/server/guards"
import { addHookType, deleteHookType, labelOldHooks, readHookTypeSettings, type HookTypeSettings, type LabelResult } from "@/server/viral/hook-types"

/**
 * Settings → Hook types (`workspace/docs/library.md`, more-features task part
 * 7): the person's own types beside the fixed ones, and the one-off pass that
 * labels the hooks with no type yet. Admin only, like every Viral door; the
 * owner always comes from the session.
 */

export type { HookTypeSettings, LabelResult }

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<HookTypeSettings> => readHookTypeSettings(context.user.id))

export function loadHookTypeSettings() {
  return loadFn()
}

const addFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: z.string().min(1).max(HOOK_TYPE_NAME_MAX * 2) }))
  .handler(async ({ data, context }): Promise<HookTypeSettings> => {
    await addHookType(context.user.id, data.name)
    return readHookTypeSettings(context.user.id)
  })

/** Adds one of your own types. Answers the tab's settings as they are now. */
export function addHookTypeFn(name: string) {
  return addFn({ data: { name } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ typeId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<HookTypeSettings> => {
    await deleteHookType(context.user.id, data.typeId)
    return readHookTypeSettings(context.user.id)
  })

/** Deletes one of your own types; its hooks go back to no type. */
export function deleteHookTypeFn(typeId: string) {
  return deleteFn({ data: { typeId } })
}

const labelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<{ result: LabelResult; settings: HookTypeSettings }> => {
    const result = await labelOldHooks(context.user.id)
    return { result, settings: await readHookTypeSettings(context.user.id) }
  })

/** Label N hooks: the one-off pass, priced on the tab before it is pressed. */
export function labelOldHooksFn() {
  return labelFn()
}
