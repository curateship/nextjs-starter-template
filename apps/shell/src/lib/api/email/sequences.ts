import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { sequenceStepsSchema, type SequenceSteps } from "@/lib/broadcasts/sequence-graph"
import {
  createSequence as createSequenceRow,
  deleteSequences as deleteSequenceRows,
  duplicateSequence as duplicateSequenceRow,
  listSequences,
  saveSequence as saveSequenceRow,
  type SequenceRow,
} from "@/server/email/sequences"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/** One sequence as the Sequence tab and its right panel draw it. */
export type SequenceItem = {
  id: string
  name: string
  /** Null when the stored steps are not a chain the tab drew. */
  steps: SequenceSteps | null
  /** The automations whose Send sequence step sends it. */
  used_by: { id: string; name: string }[]
  in_progress: number
  finished: number
  updated_at: string
}

function toItem(row: SequenceRow): SequenceItem {
  return {
    id: row.id,
    name: row.name,
    steps: row.steps,
    used_by: row.usedBy,
    in_progress: row.inProgress,
    finished: row.finished,
    updated_at: row.updatedAt.toISOString(),
  }
}

const idSchema = z.string().min(1).max(36)
const nameSchema = z.string().trim().min(1).max(80)

export const getSequenceErrorMessage = createErrorMessage(
  {
    NOT_FOUND: "That sequence no longer exists.",
    NAME_REQUIRED: "Name the sequence first.",
    NAME_TAKEN: "Another sequence already has that name.",
    COPY_LIMIT: "Could not find a free name for the copy.",
  },
  "We could not save that change to the sequence. Please try again."
)

const loadSequencesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<SequenceItem[]> =>
    (await listSequences(await workspaceIdForRequest(context.user.id))).map(toItem)
  )

const createSequenceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: nameSchema }))
  .handler(async ({ data, context }): Promise<SequenceItem> =>
    toItem(await createSequenceRow(await workspaceIdForRequest(context.user.id), context.user.id, data.name))
  )

const saveSequenceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: idSchema, name: nameSchema, steps: sequenceStepsSchema }))
  .handler(async ({ data, context }): Promise<SequenceItem> =>
    toItem(await saveSequenceRow(await workspaceIdForRequest(context.user.id), data))
  )

const duplicateSequenceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }): Promise<SequenceItem> =>
    toItem(await duplicateSequenceRow(await workspaceIdForRequest(context.user.id), context.user.id, data.id))
  )

const deleteSequencesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(idSchema).min(1).max(200) }))
  .handler(async ({ data, context }): Promise<{ count: number }> => ({
    count: await deleteSequenceRows(await workspaceIdForRequest(context.user.id), data.ids),
  }))

export function loadSequences() {
  return loadSequencesFn()
}

export function createSequence(name: string) {
  return createSequenceFn({ data: { name } })
}

export function saveSequence(input: { id: string; name: string; steps: SequenceSteps }) {
  return saveSequenceFn({ data: input })
}

export function duplicateSequence(id: string) {
  return duplicateSequenceFn({ data: { id } })
}

export function deleteSequences(ids: string[]) {
  return deleteSequencesFn({ data: { ids } })
}
