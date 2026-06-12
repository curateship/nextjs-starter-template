import { createFileRoute } from "@tanstack/react-router"

import { ProjectEditorPage } from "@/pages/video-editor/project-editor-page"

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor/$projectId"
)({
  component: ProjectEditorPage,
})
