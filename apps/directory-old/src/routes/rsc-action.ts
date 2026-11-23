import { createFileRoute } from "@tanstack/react-router"

import {
  isSameOriginRequest,
  readLimitedRequestBody,
} from "@/lib/rsc-action-security"

const MAX_ACTION_BODY_BYTES = 10 * 1024 * 1024
const MAX_ACTION_ID_LENGTH = 4096

async function handleAction({ request }: { request: Request }) {
  if (!isSameOriginRequest(request)) {
    return new Response("Forbidden", { status: 403 })
  }

  const actionId = request.headers.get("x-rsc-action-id")
  if (!actionId || actionId.length > MAX_ACTION_ID_LENGTH) {
    return new Response("Invalid action", { status: 400 })
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_ACTION_BODY_BYTES) {
    return new Response("Action payload is too large", { status: 413 })
  }

  const contentType = request.headers.get("content-type")
  const bodyBytes = await readLimitedRequestBody(request, MAX_ACTION_BODY_BYTES)
  if (!bodyBytes) {
    return new Response("Action payload is too large", { status: 413 })
  }

  const body = contentType?.startsWith("multipart/form-data")
    ? await new Response(bodyBytes, {
        headers: { "content-type": contentType },
      }).formData()
    : new TextDecoder().decode(bodyBytes)

  const rscActions = await import.meta.viteRsc.import<
    typeof import("../rsc-action-handler")
  >("../rsc-action-handler", { environment: "rsc" })

  return rscActions.handleRscAction(request, actionId, body)
}

export const Route = createFileRoute("/rsc-action")({
  server: {
    handlers: {
      POST: handleAction,
    },
  },
})
