import { createFileRoute } from "@tanstack/react-router"

import { VideoEditorPage } from "@/pages/video-editor/video-editor-page"

export const Route = createFileRoute("/_authenticated/admin/video-editor")({
  component: VideoEditorPage,
})
