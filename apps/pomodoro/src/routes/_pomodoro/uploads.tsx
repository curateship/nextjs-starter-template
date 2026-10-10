import { createFileRoute } from "@tanstack/react-router"

import { UploadsPage } from "@/components/pomodoro/uploads-page"
import type { UploadView } from "@/lib/api/pomodoro/media-uploads"

/** My uploads: your own backgrounds and sounds, and the AI generator for each. */
export const Route = createFileRoute("/_pomodoro/uploads")({
  validateSearch: (
    search: Record<string, unknown>
  ): { kind?: UploadView } =>
    search.kind === "sound" || search.kind === "background" || search.kind === "bin"
      ? { kind: search.kind }
      : {},
  component: UploadsRoute,
})

function UploadsRoute() {
  const { kind } = Route.useSearch()
  return <UploadsPage kind={kind ?? "background"} />
}
