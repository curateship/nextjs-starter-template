import { assertPublicHttpUrl } from "@/server/automations/net-guard"
import type { NodeExecutor } from "@/server/automations/types"

const WEBHOOK_TIMEOUT_MS = 10_000

export const executeWebhook: NodeExecutor = async (ctx) => {
  const node = ctx.config.nodes[ctx.nodeId]
  if (node?.kind !== "webhook") throw new Error("Node is not a webhook node")

  let parsed: URL
  try {
    parsed = new URL(node.settings.url)
  } catch {
    throw new Error("Invalid webhook URL")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid webhook URL")
  }
  await assertPublicHttpUrl(parsed)

  const contact = ctx.contact
  const response = await fetch(node.settings.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "automation.webhook",
      note: node.settings.note || undefined,
      automationId: ctx.run.automationId,
      runId: ctx.run.id,
      contact: {
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        tags: contact.tags,
        source: contact.source,
        customFields: contact.customFields,
      },
    }),
    // Manual: a redirect is recorded as the outcome instead of followed —
    // following one could bounce the request to a private address.
    redirect: "manual",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  })

  await response.body?.cancel().catch(() => {})

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return { type: "next", output: { status: response.status, ok: true } }
}
