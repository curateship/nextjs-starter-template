import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LINKED_ADDRESS_MAX } from "@/lib/project/linked-records"
import { requireOwnAccount } from "@/server/auth/security"
import { userPost } from "@/server/guards"
import { openLinkedRecord, setTaskLink } from "@/server/project/linked-records"

export type { TaskLink } from "@/server/project/linked-records"

const id = z.string().min(1).max(36)

const setTaskLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id, address: z.string().max(LINKED_ADDRESS_MAX) }))
  .handler(async ({ data, context }) => setTaskLink(context.user, data))

/**
 * Makes the stamped note. The person must really be themselves: the site
 * admin viewing the app as Sam would otherwise sign in to Video as Sam.
 */
const openLinkedRecordFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data }) => {
    const me = await requireOwnAccount().catch(() => {
      throw new Error(PROJECT_ERRORS.linkedWhileViewingAs)
    })
    return openLinkedRecord(me, data.taskId)
  })

/** Points the task at the record in a pasted address; an empty one takes it off. */
export function setProjectTaskLink(taskId: string, address: string) {
  return setTaskLinkFn({ data: { taskId, address } })
}

/** The address that opens the task's record in its app, signed in, for 60 seconds. */
export function openProjectTaskLink(taskId: string) {
  return openLinkedRecordFn({ data: { taskId } })
}
