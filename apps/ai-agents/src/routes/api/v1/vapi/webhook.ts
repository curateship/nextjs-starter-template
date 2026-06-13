import { createFileRoute } from "@tanstack/react-router"

import { applyNormalizedCall, findCallByProviderCallId } from "@/server/calls"
import { parseVapiWebhookCall } from "@/server/providers/vapi"

// Vapi server-message webhook. Additive to polling: local dev works without
// it; in production it lands call results the moment they happen. Both paths
// share the provider normalizer + applyNormalizedCall, so behavior is identical.
export const Route = createFileRoute("/api/v1/vapi/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify the shared secret when one is configured.
        const secret = process.env.AI_AGENTS_VAPI_WEBHOOK_SECRET
        if (secret && request.headers.get("x-vapi-secret") !== secret) {
          return Response.json({ detail: "Invalid secret" }, { status: 401 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ detail: "Invalid JSON" }, { status: 400 })
        }

        // Not a call event we track (e.g. assistant-request) — acknowledge.
        const normalized = parseVapiWebhookCall(body)
        if (!normalized) {
          return Response.json({ ok: true })
        }

        // Unknown call (different environment, deleted row) — acknowledge so
        // Vapi doesn't retry forever.
        const localCall = await findCallByProviderCallId(normalized.providerCallId)
        if (!localCall) {
          return Response.json({ ok: true })
        }

        await applyNormalizedCall(localCall.id, normalized)
        return Response.json({ ok: true })
      },
    },
  },
})
