import { createFileRoute } from "@tanstack/react-router"

import { UploadsPage } from "@/components/pomodoro/uploads-page"
import type { UploadView } from "@/lib/api/pomodoro/media-uploads"
import { PROMPT_MAX_LENGTH } from "@/lib/pomodoro/generation"

/** My uploads: your own backgrounds and sounds, and the AI generator for each. */
export const Route = createFileRoute("/_pomodoro/uploads")({
  validateSearch: (
    search: Record<string, unknown>
  ): { kind?: UploadView; prompt?: string; purchase?: string } => ({
    ...(search.kind === "sound" || search.kind === "background" || search.kind === "bin"
      ? { kind: search.kind }
      : {}),
    // Words for the generator's box, from "Make a matching sound" (task 06,
    // part 4). Only ever typed into the member's own box; nothing is sent.
    ...(typeof search.prompt === "string" && search.prompt.trim()
      ? { prompt: search.prompt.slice(0, PROMPT_MAX_LENGTH) }
      : {}),
    // Stripe's checkout session, on the way back from buying (task 07). The
    // server checks it is this member's own before saying anything about it.
    ...(typeof search.purchase === "string" && /^cs_[A-Za-z0-9_]{10,250}$/.test(search.purchase)
      ? { purchase: search.purchase }
      : {}),
  }),
  component: UploadsRoute,
})

function UploadsRoute() {
  const { kind, prompt, purchase } = Route.useSearch()
  return (
    <UploadsPage
      kind={kind ?? "background"}
      seedPrompt={prompt ?? ""}
      purchaseSession={purchase ?? ""}
    />
  )
}
