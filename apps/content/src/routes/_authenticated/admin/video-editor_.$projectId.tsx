import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"

import { EditorBackProvider } from "@/components/content-app/editor-back"
import { CaptionSettingsProvider } from "@/components/video-editor/caption-settings-context"
import { EditorProvider } from "@/components/video-editor/editor-provider"
import { EmptyProject } from "@/components/video-editor/empty-project"
import { ProjectSettingsProvider } from "@/components/video-editor/project-settings"
import { StudioEditor } from "@/components/video-editor/studio-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { loadEditorProject } from "@/lib/api/content-app/projects"
import { openVideo, rememberVideo } from "@/lib/api/video/project-videos"
import { getProjectErrorMessage } from "@/lib/api/video/projects"
import { loadCaptionSettings } from "@/lib/api/video/settings"
import { readVideoSearch } from "@/lib/video/project-video-search"

/**
 * One project in the editor, open on one of its videos
 * (`workspace/docs/project-videos.md`). `?video=` names the video; without
 * it the project opens on the video this person last had open, or its first.
 */
export const Route = createFileRoute(
  "/_authenticated/admin/video-editor_/$projectId"
)({
  validateSearch: readVideoSearch,
  loaderDeps: ({ search }) => ({ video: search.video }),
  // The caption look comes with the video, so every caption window opens on
  // the saved look rather than switching to it a moment later.
  loader: async ({ params, deps }) => {
    const [opened, captionSettings, backTo] = await Promise.all([
      openVideo(params.projectId, deps.video),
      loadCaptionSettings(),
      // The project this video project is, for the header's back button (`workspace/docs/content-app.md`).
      loadEditorProject(params.projectId),
    ])
    return { ...opened, captionSettings, backTo }
  },
  component: AdminVideoEditorRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function AdminVideoEditorRoute() {
  const { project, video, captionSettings, backTo } = Route.useLoaderData()
  const { panel } = Route.useSearch()
  // Saving is reported in the sticky app header, beside every other auto-save.
  const { reportSaveStatus } = useShellRuntime()

  // The project opens on this video next time.
  const videoId = video?.id
  React.useEffect(() => {
    if (!videoId) return
    rememberVideo(videoId).catch((error) => console.error("Remembering the open video failed", error))
  }, [videoId])

  if (!video) {
    return (
      <EditorBackProvider value={backTo}>
        <EmptyProject project={project} guest={false} />
      </EditorBackProvider>
    )
  }

  return (
    <EditorBackProvider value={backTo}>
    <EditorProvider
      // Start again from scratch when switching videos, so no editor state
      // can leak from one into the next.
      key={video.id}
      document={{
        id: video.id,
        projectId: project.id,
        name: video.name,
        version: video.version,
        timeline: video.timeline,
      }}
    >
      <ProjectSettingsProvider project={project} video={video}>
        <CaptionSettingsProvider value={captionSettings}>
          <StudioEditor
            timelineError={video.timeline_error}
            reportSaveStatus={reportSaveStatus}
            initialPanel={panel}
          />
        </CaptionSettingsProvider>
      </ProjectSettingsProvider>
    </EditorProvider>
    </EditorBackProvider>
  )
}
