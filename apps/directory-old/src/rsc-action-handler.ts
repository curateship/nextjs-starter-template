import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from "@vitejs/plugin-rsc/rsc"

import { runWithRequestContext } from "@/lib/request-headers"

interface ActionResult {
  data: unknown
  ok: boolean
}

function createActionResponse(
  result: ActionResult,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>
) {
  const stream = renderToReadableStream(result, { temporaryReferences })
  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/x-component;charset=utf-8",
    },
  })
}

export async function handleRscAction(
  request: Request,
  actionId: string,
  body: string | FormData
) {
  const temporaryReferences = createTemporaryReferenceSet()

  try {
    const args = await decodeReply(body, { temporaryReferences })
    const action = await loadServerAction(actionId)
    const data = await runWithRequestContext(request, () =>
      action(...args)
    )

    return createActionResponse({ data, ok: true }, temporaryReferences)
  } catch (error) {
    console.error("RSC action failed", error)
    return createActionResponse(
      { data: new Error("Server action failed"), ok: false },
      temporaryReferences
    )
  }
}
