import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ClapperboardIcon, FolderInputIcon, Loader2Icon, PackageIcon } from "lucide-react"

import { RecordFrame } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getFlowErrorMessage, saveFlowRun, type FlowRunDetail } from "@/lib/api/video/flow"
import { getProjectErrorMessage, listProjects } from "@/lib/api/video/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { flowKindOf } from "@/lib/video/flow/node-kinds"

/** What saving puts into the project, worked out from the run's steps. */
function whatGetsSaved(run: FlowRunDetail) {
  const cut = run.steps.find((step) => flowKindOf(step.kind) === "ai-video" && step.status === "done")
  const files = new Set(run.steps.flatMap((step) => step.output?.mediaIds ?? []))
  const thumbnails = run.steps.filter((step) => flowKindOf(step.kind) === "ai-thumbnail" && step.output?.mediaIds?.length).length
  return {
    video: run.videoId ? (run.videoName ?? "The run's video") : run.hasCut ? `A new video, "${run.flowName}"${cut?.output?.summary ? `, ${cut.output.summary}` : ""}` : null,
    files: files.size,
    thumbnails,
  }
}

/**
 * The middle's card on the last step: what saving puts into the project, in
 * the same grey frame as every step's card.
 */
export function SavePreview({ run }: { run: FlowRunDetail }) {
  const saved = whatGetsSaved(run)
  const rows = [
    { label: "Video", value: saved.video ?? "None yet. AI video makes it." },
    { label: "Files on the Media shelf", value: saved.files === 1 ? "1 file" : `${saved.files} files` },
    { label: "Thumbnail", value: saved.thumbnails ? "On the video's Thumbnail board" : "None" },
  ]
  return (
    <div className="rounded-2xl bg-muted/60 p-6 @4xl:p-8">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <PackageIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-base font-medium">{run.projectId ? `Saved in ${run.projectName}` : "What gets saved"}</span>
        </div>
        <ul className="grid px-6 py-3">
          {rows.map((row) => (
            <li key={row.label} className="grid gap-0.5 border-b py-3 text-sm last:border-b-0">
              <span className="font-medium">{row.label}</span>
              <span className="text-muted-foreground">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

type ProjectChoice = { id: string; name: string }

/**
 * The right panel on the last step: the project box and Save to project at
 * the foot (Tyler, 14 Nov 2026, of the project box that was under Run: "this
 * should be removed. its the last step"). Once saved, the project it went
 * into and the button that opens the video.
 */
export function SaveStepPanel({
  run,
  index,
  count,
  onRun,
}: {
  run: FlowRunDetail
  index: number
  count: number
  onRun: (run: FlowRunDetail) => void
}) {
  const [projects, setProjects] = React.useState<ProjectChoice[] | null>(null)
  const [readError, setReadError] = React.useState<string | null>(null)
  const [projectId, setProjectId] = React.useState("")
  const [save, busy] = useAsyncAction(getFlowErrorMessage)
  const saved = run.projectId !== null
  // The last step opens once every step before it is done.
  const waitingOn = run.steps.filter((step) => step.status !== "done")
  const ready = waitingOn.length === 0

  React.useEffect(() => {
    if (saved) return
    let live = true
    listProjects({ pageSize: 100 })
      .then((page) => {
        if (!live) return
        const choices = page.projects.map((project) => ({ id: project.id, name: project.name }))
        setProjects(choices)
        setProjectId((current) => current || choices[0]?.id || "")
      })
      .catch((error: unknown) => {
        if (live) setReadError(getProjectErrorMessage(error))
      })
    return () => {
      live = false
    }
  }, [saved])

  const stateLine = saved ? "Done" : run.status === "stopped" ? "Stopped" : ready ? "Pick the project" : "Waiting"

  return (
    <RecordFrame
      avatar={<FolderInputIcon aria-hidden />}
      title="Save to a project"
      line={`Step ${index + 1} of ${count} · ${stateLine}`}
      hideLabel="Hide the step"
      body={
        !saved && !ready ? (
          <PanelCard storageId="video-flow-run-status" icon={<FolderInputIcon />} title="This step">
            <p className="text-sm text-muted-foreground">
              This step opens once every step before it is done. Still to do: {waitingOn.map((step) => step.title).join(", ")}.
            </p>
          </PanelCard>
        ) : saved ? (
          <PanelCard storageId="video-flow-run-saved" icon={<FolderInputIcon />} title="Saved">
            <div className="grid gap-3 text-sm">
              <p>Saved in {run.projectName}.</p>
              {run.videoId && run.projectId ? (
                <Button asChild variant="outline" className="w-fit">
                  <Link to="/admin/video-editor/$projectId" params={{ projectId: run.projectId }} search={{ video: run.videoId }}>
                    <ClapperboardIcon />
                    Open the video
                  </Link>
                </Button>
              ) : null}
            </div>
          </PanelCard>
        ) : (
          <PanelCard storageId="video-flow-run-project" icon={<FolderInputIcon />} title="Project">
            <div className="grid gap-2">
              <FieldLabel htmlFor={`flow-save-project-${run.id}`} className="sr-only">
                Project
              </FieldLabel>
              {readError ? (
                <p className="text-sm text-destructive">{readError}</p>
              ) : projects && !projects.length ? (
                <p className="text-sm text-muted-foreground">Make a project in the Video editor first, then come back to save.</p>
              ) : (
                <Select
                  value={projectId}
                  onValueChange={(next) => {
                    if (next) setProjectId(next)
                  }}
                  disabled={busy || !projects}
                >
                  <SelectTrigger id={`flow-save-project-${run.id}`} className="w-full">
                    <SelectValue placeholder={projects ? "Pick a project" : "Reading your projects…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">The run's video and files go into this project.</p>
            </div>
          </PanelCard>
        )
      }
      footer={
        saved || !ready || run.status === "stopped" ? null : (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() =>
              void save(async () => {
                if (!projectId) throw new Error("Pick a project first.")
                onRun(await saveFlowRun(run.id, projectId))
              })
            }
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <FolderInputIcon />}
            Save to project
          </Button>
        )
      }
    />
  )
}
