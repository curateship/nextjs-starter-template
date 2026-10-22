import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { EQUIPMENT, MOVEMENTS, MUSCLES } from "@/lib/fitness/exercise-catalog"
import { ROUTINE_TYPE_IDS } from "@/lib/fitness/routine-types"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { userGet, userPost } from "@/server/guards"
import { isOwnedImageUrl } from "@/server/media/library"
import {
  avoidExercise,
  createExercise,
  deleteExercise,
  deleteExercises,
  listExercises,
  stopAvoidingExercise,
  updateExercise,
} from "@/server/fitness/exercises"

export type { Exercise } from "@/server/fitness/exercises"

const id = z.string().min(1).max(36)

/**
 * A lift's picture must be one the person uploaded to the media library, the
 * same rule the shell applies to profile photos, so a lift can never show an
 * outside address that tracks who looks at it.
 */
async function requireOwnPicture(userId: string, url: string | null) {
  if (url && !(await isOwnedImageUrl(userId, url))) throw new Error(FITNESS_ERRORS.pictureNotYours)
}

const exerciseInput = z.object({
  name: z.string().max(80),
  routineType: z.enum(ROUTINE_TYPE_IDS),
  muscles: z.array(z.enum(MUSCLES)).max(MUSCLES.length),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length),
  movement: z.enum(MOVEMENTS),
  isBodyweight: z.boolean(),
  isTimed: z.boolean(),
  pictureUrl: z.string().url().max(2000).nullable(),
})

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listExercises(context.user.id))

export function loadExercises() {
  return listFn()
}

const changeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), input: exerciseInput }),
      z.object({ action: z.literal("update"), exerciseId: id, input: exerciseInput }),
      z.object({ action: z.literal("delete"), exerciseId: id }),
      z.object({ action: z.literal("deleteMany"), exerciseIds: z.array(id).min(1).max(200) }),
      z.object({ action: z.literal("avoid"), exerciseId: id, note: z.string().max(300) }),
      z.object({ action: z.literal("unavoid"), exerciseId: id }),
    ])
  )
  .handler(async ({ data, context }): Promise<{ id?: string; done?: string[]; kept?: string[] }> => {
    const user = context.user.id
    switch (data.action) {
      case "create":
        await requireOwnPicture(user, data.input.pictureUrl)
        return { id: (await createExercise(user, data.input)).id }
      case "update":
        await requireOwnPicture(user, data.input.pictureUrl)
        await updateExercise(user, data.exerciseId, data.input)
        return {}
      case "delete":
        await deleteExercise(user, data.exerciseId)
        return {}
      case "deleteMany":
        return deleteExercises(user, data.exerciseIds)
      case "avoid":
        await avoidExercise(user, data.exerciseId, data.note)
        return {}
      case "unavoid":
        await stopAvoidingExercise(user, data.exerciseId)
        return {}
    }
  })

export function changeExercise(data: Parameters<typeof changeFn>[0]["data"]) {
  return changeFn({ data })
}
