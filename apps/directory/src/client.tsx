import {
  createFromFetch,
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from "@vitejs/plugin-rsc/browser"
import { StartClient } from "@tanstack/react-start/client"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"

interface ActionResult {
  data: unknown
  ok: boolean
}

setServerCallback(async (actionId, args) => {
  const temporaryReferences = createTemporaryReferenceSet()
  const body = await encodeReply(args, { temporaryReferences })
  const response = fetch("/rsc-action", {
    body,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "x-rsc-action-id": actionId },
    method: "POST",
  })
  const result = await createFromFetch<ActionResult>(response, {
    temporaryReferences,
  })

  if (!result.ok) throw result.data
  return result.data
})

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>
  )
})
