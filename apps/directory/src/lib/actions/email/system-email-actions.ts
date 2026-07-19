import { createServerFn } from "@tanstack/react-start"
import { getSystemEmailDashboardActionImpl, getSystemEmailEditorActionImpl, saveSystemEmailTemplateActionImpl } from "./system-email-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./system-email-actions.server"

export const getSystemEmailDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSystemEmailDashboardActionImpl(data.siteId))

export const getSystemEmailEditorAction = createServerFn({ method: "POST" })
  .inputValidator((data: { templateKeyInput: string; siteId?: string | null }) => data)
  .handler(async ({ data }) => getSystemEmailEditorActionImpl(data.templateKeyInput, data.siteId))

export const saveSystemEmailTemplateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  templateKey: string
  siteId?: string | null
  subject: string
  contentBlocks: Record<string, any>
  fromName?: string | null
  replyTo?: string | null
} }) => data)
  .handler(async ({ data }) => saveSystemEmailTemplateActionImpl(data.input))
