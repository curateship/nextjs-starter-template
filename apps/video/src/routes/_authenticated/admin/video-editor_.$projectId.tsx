import { createFileRoute } from "@tanstack/react-router"

import { CaptionSettingsProvider } from "@/components/video-editor/caption-settings-context"
import { EditorProvider } from "@/components/video-editor/editor-provider"
import { ProjectSettingsProvider } from "@/components/video-editor/project-settings"
import { StudioEditor } from "@/components/video-editor/studio-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { getProject, getProjectErrorMessage } from "@/lib/api/video/projects"
import { loadCaptionSettings } from "@/lib/api/video/settings"

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor_/$projectId"
)({
  // The caption look comes with the project, so every caption window opens
  // on the saved look rather than switching to it a moment later.
  loader: async ({ params }) => {
    const [project, captionSettings] = await Promise.all([
      getProject(params.projectId),
      loadCaptionSettings(),
    ])
    return { project, captionSettings }
  },
  component: AdminVideoEditorRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function AdminVideoEditorRoute() {
  const { project, captionSettings } = Route.useLoaderData()
  // Saving is reported in the sticky app header, beside every other auto-save.
  const { reportSaveStatus } = useShellRuntime()

  return (
    <EditorProvider
      // Start again from scratch when switching projects, so no editor state
      // can leak from one into the next.
      key={project.id}
      document={{
        id: project.id,
        name: project.name,
        version: project.version,
        timeline: project.timeline,
      }}
    >
      <ProjectSettingsProvider project={project}>
        <CaptionSettingsProvider value={captionSettings}>
          <StudioEditor
            timelineError={project.timeline_error}
            reportSaveStatus={reportSaveStatus}
          />
        </CaptionSettingsProvider>
      </ProjectSettingsProvider>
    </EditorProvider>
  )
}
