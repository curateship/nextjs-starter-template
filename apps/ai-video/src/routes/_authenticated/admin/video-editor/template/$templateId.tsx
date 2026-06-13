import { createFileRoute } from "@tanstack/react-router"

import { TemplateEditorPage } from "@/pages/video-editor/template-editor-page"

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor/template/$templateId"
)({
  component: TemplateEditorPage,
})
