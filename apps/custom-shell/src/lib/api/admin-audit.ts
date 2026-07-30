import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  listAuditLogs,
  type AuditFilterOptions,
  type AuditLogRow,
} from "@/server/audit"
import { requireAdmin } from "@/server/security"

export type { AuditFilterOptions, AuditLogRow }

const listQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  // Actions and resources are free text in the trail, so the filter accepts any
  // saved value instead of an enum that would break on the next action added.
  action: z.string().trim().max(50).default("all"),
  resource: z.string().trim().max(30).default("all"),
  actor: z.string().trim().max(36).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  sort: z.enum(["action", "resource", "created"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export type AuditListQueryInput = z.input<typeof listQuerySchema>

/**
 * How many rows the route loader asks for. The loader runs before the
 * workspace's own rows-per-page setting is known, so the dashboard compares the
 * two and refetches once when they differ.
 */
export const AUDIT_LOADER_PAGE_SIZE = 25

const adminAuditErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
}

export function getAdminAuditErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(adminAuditErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? adminAuditErrorMessages[matched]
    : "We could not load the activity log. Please try again."
}

const listAuditLogsFn = createServerFn({ method: "GET" })
  .inputValidator(listQuerySchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    return listAuditLogs(data)
  })

export function listAdminAuditLogs(query: AuditListQueryInput) {
  return listAuditLogsFn({ data: query })
}
