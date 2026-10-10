import { createFileRoute } from "@tanstack/react-router"

import { UploadsPage } from "@/components/pomodoro/uploads-page"
import type { PomodoroUploadPurpose } from "@/lib/pomodoro/media-limits"

/** My uploads: your own backgrounds and sounds, and the AI generator for each. */
export const Route = createFileRoute("/_pomodoro/uploads")({
  validateSearch: (
    search: Record<string, unknown>
  ): { kind?: PomodoroUploadPurpose } =>
    search.kind === "sound" || search.kind === "background"
      ? { kind: search.kind }
      : {},
  component: UploadsRoute,
})

function UploadsRoute() {
  const { kind } = Route.useSearch()
  return <UploadsPage kind={kind ?? "background"} />
}
