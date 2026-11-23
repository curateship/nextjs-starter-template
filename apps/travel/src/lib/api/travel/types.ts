import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TYPE_COLORS, TYPE_ICONS, type TypeColor, type TypeIcon } from "@/lib/travel/activity-types"
import { id } from "@/lib/travel/rules"
import { userGet, userPost } from "@/server/guards"
import { countTypeUse, createType, deleteType, listTypes, reorderTypes, updateType } from "@/server/travel/types"

export type { ActivityType } from "@/lib/travel/activity-types"

/** A type's name, as the person types it. */
const typeName = z
  .string()
  .trim()
  .min(1, "Give the type a name.")
  .max(40, "A type's name can be at most 40 characters.")

const icon = z.enum(TYPE_ICONS)
const color = z.enum(TYPE_COLORS)

const listTypesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listTypes(context.user.id))

const createTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: typeName, icon, color }))
  .handler(async ({ data, context }) => createType(context.user.id, data))

const updateTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ typeId: id, name: typeName.optional(), icon: icon.optional(), color: color.optional() }))
  .handler(async ({ data, context }) => updateType(context.user.id, data))

const countTypeUseFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ typeId: id }))
  .handler(async ({ data, context }) => countTypeUse(context.user.id, data.typeId))

const deleteTypeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ typeId: id }))
  .handler(async ({ data, context }) => deleteType(context.user.id, data.typeId))

const reorderTypesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ typeIds: z.array(id).max(100) }))
  .handler(async ({ data, context }) => reorderTypes(context.user.id, data.typeIds))

export function getActivityTypes() {
  return listTypesFn()
}
export function addActivityType(data: { name: string; icon: TypeIcon; color: TypeColor }) {
  return createTypeFn({ data })
}
export function saveActivityType(data: { typeId: string; name?: string; icon?: TypeIcon; color?: TypeColor }) {
  return updateTypeFn({ data })
}
/** How many activities use a type, for the question before removing it. */
export function countActivityTypeUse(typeId: string) {
  return countTypeUseFn({ data: { typeId } })
}
export function removeActivityType(typeId: string) {
  return deleteTypeFn({ data: { typeId } })
}
export function orderActivityTypes(typeIds: string[]) {
  return reorderTypesFn({ data: { typeIds } })
}
