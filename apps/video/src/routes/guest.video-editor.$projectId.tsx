import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"

import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"
import { EditorProvider } from "@/components/video-editor/editor-provider"
import { ProjectGuestProvider } from "@/components/video-editor/project-guest"
import { ProjectGuestNotice } from "@/components/video-editor/project-guest-notice"
import { ProjectSettingsProvider } from "@/components/video-editor/project-settings"
import { StudioEditor } from "@/components/video-editor/studio-editor"
import { getProjectGuestErrorMessage, loadProjectGuest } from "@/lib/api/video/project-guests"
import { getProject } from "@/lib/api/video/projects"

/**
 * The editor for a guest sent from Project (`workspace/docs/project-guests.md`):
 * one video project, no Video account, for 12 hours. It sits outside
 * `/admin` and the signed-in layout, so there is no left menu, no other
 * project and no settings to reach. The editor's own pieces leave out what a
 * guest can't use, and every server call checks the guest's project again.
 */
export const Route = createFileRoute("/guest/video-editor/$projectId")({
  loader: async ({ params }) => {
    const [guest, project] = await Promise.all([
      loadProjectGuest(params.projectId),
      getProject(params.projectId),
    ])
    return { guest, project }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.project.name ?? "Video" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GuestVideoEditorRoute,
  errorComponent: ({ error }) => (
    <ProjectGuestNotice title="This video can't be opened" text={getProjectGuestErrorMessage(error)} />
  ),
})

const SAVE_WORDS: Record<string, string> = { saving: "Saving…", saved: "Saved" }

function GuestVideoEditorRoute() {
  const { guest, project } = Route.useLoaderData()
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus | null>(null)
  const saveWords = typeof saveStatus === "string" ? SAVE_WORDS[saveStatus] : undefined

  return (
    <ProjectGuestProvider value={{ name: guest.name, projectId: project.id }}>
      <div className="flex h-svh min-h-0 flex-col gap-2 bg-muted/60 p-2 md:gap-3 md:p-3">
        <header className="flex items-center justify-between gap-3 px-1 text-sm">
          <p className="min-w-0 truncate text-muted-foreground">
            Editing as <span className="font-medium text-foreground">{guest.name}</span> via Project
          </p>
          <p aria-live="polite" className="shrink-0 text-muted-foreground">
            {saveWords ?? ""}
          </p>
        </header>
        <EditorProvider
          key={project.id}
          document={{
            id: project.id,
            name: project.name,
            version: project.version,
            timeline: project.timeline,
          }}
        >
          <ProjectSettingsProvider project={project}>
            <StudioEditor timelineError={project.timeline_error} reportSaveStatus={setSaveStatus} />
          </ProjectSettingsProvider>
        </EditorProvider>
      </div>
    </ProjectGuestProvider>
  )
}
