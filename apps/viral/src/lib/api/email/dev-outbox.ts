import { createServerFn } from "@tanstack/react-start"

import { createErrorMessage } from "@/lib/api/error-message"
import { adminGet } from "@/server/guards"
import { listDevEmails } from "@/server/email/dev-outbox"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export type DevOutboxItem = {
  id: string
  toEmail: string
  subject: string
  html: string
  created_at: string
}

const loadDevOutboxFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<DevOutboxItem[]> => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    return listDevEmails(workspaceId).map((email) => ({
      id: email.id,
      toEmail: email.toEmail,
      subject: email.subject,
      html: email.html,
      created_at: email.createdAt.toISOString(),
    }))
  })

export const getDevOutboxErrorMessage = createErrorMessage(
  {
    DEV_OUTBOX_UNAVAILABLE:
      "The development outbox is not available on this server.",
  },
  "We could not load the development outbox. Please try again.",
)

export function loadDevOutbox() {
  return loadDevOutboxFn()
}
