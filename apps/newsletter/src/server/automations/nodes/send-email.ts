import { getEmailProvider } from "@/server/email-provider"
import { getSendableEmailConfig } from "@/server/email-settings"
import { newsletterDeliveries } from "@/server/schema"
import { uuid } from "@/server/security"
import type { NodeExecutor } from "@/server/automations/types"

export const executeSendEmail: NodeExecutor = async (ctx) => {
  const node = ctx.config.nodes[ctx.nodeId]
  if (node?.kind !== "sendEmail") throw new Error("Node is not a sendEmail node")

  if (ctx.contact.status === "unsubscribed") {
    return { type: "next", output: { skipped: "unsubscribed" } }
  }

  const emailConfig = await getSendableEmailConfig(ctx.workspaceId, ctx.database)
  if (!emailConfig) {
    throw new Error("Email settings are not configured")
  }

  const subject = personalize(node.settings.subject, ctx, { html: false })
  let html = personalize(node.settings.body, ctx, { html: true })
  if (node.settings.preheader) {
    const preheader = personalize(node.settings.preheader, ctx, { html: true })
    html =
      `<span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>` +
      html
  }

  const provider = getEmailProvider(emailConfig.apiKey)
  const result = await provider.send({
    from: emailConfig.from,
    to: ctx.contact.email,
    subject,
    html,
  })

  await ctx.database.insert(newsletterDeliveries).values({
    id: uuid(),
    workspaceId: ctx.workspaceId,
    runId: ctx.run.id,
    contactId: ctx.contact.id,
    toEmail: ctx.contact.email,
    subject,
    providerMessageId: result.messageId ?? null,
    status: result.success ? "sent" : "failed",
    error: result.success ? null : (result.error ?? "Send failed"),
    createdAt: ctx.now(),
  })

  if (!result.success) {
    throw new Error(result.error ?? "Send failed")
  }

  return { type: "next", output: { messageId: result.messageId } }
}

function personalize(
  template: string,
  ctx: {
    contact: { email: string; firstName: string | null; lastName: string | null }
  },
  options: { html: boolean }
) {
  // Contact fields are external input (they arrive via the ingest API), so
  // they must not be able to inject markup into the owner's email HTML.
  const clean = (value: string) => (options.html ? escapeHtml(value) : value)
  return template
    .replaceAll("{{email}}", clean(ctx.contact.email))
    .replaceAll("{{firstName}}", clean(ctx.contact.firstName ?? ""))
    .replaceAll("{{lastName}}", clean(ctx.contact.lastName ?? ""))
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
