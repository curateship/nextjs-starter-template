import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  broadcastBlocksSchema,
  parseStoredBlocks,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import {
  SYSTEM_EMAIL_META,
  createSystemEmailBlocks,
  systemEmailKindSchema,
  type SystemEmailKind,
} from "@/lib/system-emails/kinds"
import { sendAuthEmail } from "@/server/email/send"
import { adminGet, adminPost } from "@/server/guards"
import {
  getSystemEmail as getSystemEmailRow,
  listSystemEmailSends as listSends,
  listSystemEmails,
  updateSystemEmail as saveSystemEmail,
} from "@/server/email/system-emails"
import {
  requireCurrentWorkspace,
  parseWorkspaceSettings,
} from "@/server/people/workspaces"
import { appUrlFor } from "@/server/app-url"

import { createErrorMessage } from "../error-message"

export type SystemEmailListItem = {
  kind: SystemEmailKind
  subject: string
  /** False until somebody saves a change. Looking at one does not count. */
  edited: boolean
  updated_at: string | null
  recentSent: number
  recentFailed: number
}

/**
 * Only what the database owns. The name of each email and when it goes out are
 * fixed, and both live in `SYSTEM_EMAIL_META` where the browser already reads
 * them — sending them over the wire too would be two copies of the same
 * sentence, free to drift apart.
 */
export type SystemEmailDetail = {
  kind: SystemEmailKind
  subject: string
  preheader: string
  fromName: string | null
  blocks: BroadcastBlock[]
}

export type SystemEmailSendItem = {
  id: string
  toEmail: string
  subject: string
  status: "sent" | "failed"
  error: string | null
  created_at: string
}

export type SystemEmailSendsPage = {
  sends: SystemEmailSendItem[]
  hasMore: boolean
}

const systemEmailErrorMessages: Record<string, string> = {
  NOT_FOUND: "That email is not one this app sends.",
  CREATE_FAILED: "We could not open that email. Please try again.",
  EMAIL_NOT_CONFIGURED:
    "Email is not set up on this server, so nothing can go out.",
  EMAIL_DELIVERY_FAILED:
    "The email service would not take it. Please try again.",
}

export const getSystemEmailErrorMessage = createErrorMessage(
  systemEmailErrorMessages,
  "We could not save that change. Please try again."
)

/** The same codes, said the way a page that would not open needs them said. */
export const getSystemEmailLoadErrorMessage = createErrorMessage(
  systemEmailErrorMessages,
  "We could not load the app's emails. Please try again."
)

const kindSchema = z.object({ kind: systemEmailKindSchema })

const loadSystemEmailsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<SystemEmailListItem[]> => {
    const rows = await listSystemEmails()
    return rows.map((row) => ({
      kind: row.kind,
      subject: row.subject,
      edited: row.edited,
      updated_at: row.updatedAt?.toISOString() ?? null,
      recentSent: row.recentSent,
      recentFailed: row.recentFailed,
    }))
  })

const getSystemEmailFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(kindSchema)
  .handler(async ({ data, context }): Promise<SystemEmailDetail> => {
    // Looking at an email must not count as editing it. The router preloads
    // this the moment a link is hovered, so writing a row here would leave the
    // list saying "edited today" about emails nobody has touched. Unsaved, the
    // built-in wording is handed over as-is and the row appears on the first
    // real change — see `updateSystemEmail`.
    const row = await getSystemEmailRow(data.kind)
    if (row) return toDetail(data.kind, row)

    // An email nobody has saved starts from the workspace's saved block
    // setups, so its header and footer open already carrying the logo and
    // company lines every other email uses.
    const workspace = await requireCurrentWorkspace(context.user.id)
    return {
      kind: data.kind,
      subject: SYSTEM_EMAIL_META[data.kind].defaults.subject,
      preheader: "",
      fromName: null,
      blocks: createSystemEmailBlocks(
        data.kind,
        parseWorkspaceSettings(workspace.settings).broadcastBlockDefaults
      ),
    }
  })

const updateSystemEmailFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    kindSchema.extend({
      subject: z.string().max(500).optional(),
      preheader: z.string().max(500).optional(),
      fromName: z.string().max(255).nullable().optional(),
      blocks: broadcastBlocksSchema.optional(),
    })
  )
  .handler(async ({ data }): Promise<SystemEmailDetail> => {
    const { kind, ...fields } = data
    return toDetail(kind, await saveSystemEmail(kind, fields))
  })

const loadSystemEmailSendsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    kindSchema.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    })
  )
  .handler(async ({ data }): Promise<SystemEmailSendsPage> => {
    const { sends, hasMore } = await listSends(data.kind, {
      limit: data.limit,
      offset: data.offset,
    })
    return {
      sends: sends.map((send) => ({
        id: send.id,
        toEmail: send.toEmail,
        subject: send.subject,
        status: send.status === "sent" ? "sent" : "failed",
        error: send.error,
        created_at: send.createdAt.toISOString(),
      })),
      hasMore,
    }
  })

/**
 * Sends this email to the admin asking for it, with made-up values in the
 * placeholders.
 *
 * It goes to their own address and nowhere else — there is no recipient to
 * pass in, so this cannot be pointed at anybody. The button lands on the app's
 * front page rather than doing what it says: the real link carries a one-use
 * token tied to one person's account, and handing a working one out for a
 * preview would be handing out a way in.
 */
const sendSystemEmailTestFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(kindSchema)
  .handler(async ({ data, context }): Promise<{ delivered: boolean }> => {
    const sampleTokens: Record<SystemEmailKind, Record<string, string>> = {
      "verify-email": {},
      "sign-in-link": { minutes: "15" },
      "password-reset": {},
      "email-change": { old_email: context.user.email, hours: "24" },
      "email-change-warning": { new_email: "new-address@example.com", hours: "24" },
      "email-change-done": {
        new_email: "new-address@example.com",
        when: "Jan 1, 2026, 9:00 AM UTC",
      },
      "password-changed": {
        when: "Jan 1, 2026, 9:00 AM UTC",
        device: "Chrome on macOS",
      },
      "new-device": {
        device: "Chrome on macOS",
        when: "Jan 1, 2026, 9:00 AM UTC",
      },
      "new-account": {},
    }
    return sendAuthEmail({
      kind: data.kind,
      to: context.user.email,
      tokens: sampleTokens[data.kind],
      actionUrl: appUrlFor("/"),
    })
  })

function toDetail(
  kind: SystemEmailKind,
  row: {
    subject: string
    preheader: string
    fromName: string | null
    blocks: unknown
  }
): SystemEmailDetail {
  return {
    kind,
    subject: row.subject,
    preheader: row.preheader,
    fromName: row.fromName,
    blocks: parseStoredBlocks(row.blocks),
  }
}

export function loadSystemEmailsPage() {
  return loadSystemEmailsPageFn()
}

export function getSystemEmail(kind: SystemEmailKind) {
  return getSystemEmailFn({ data: { kind } })
}

export function updateSystemEmail(input: {
  kind: SystemEmailKind
  subject?: string
  preheader?: string
  fromName?: string | null
  blocks?: BroadcastBlock[]
}) {
  return updateSystemEmailFn({ data: input })
}

export function loadSystemEmailSends(
  kind: SystemEmailKind,
  options: { limit?: number; offset?: number } = {}
) {
  return loadSystemEmailSendsFn({ data: { kind, ...options } })
}

export function sendSystemEmailTest(kind: SystemEmailKind) {
  return sendSystemEmailTestFn({ data: { kind } })
}
