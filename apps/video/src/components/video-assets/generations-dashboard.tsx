import * as React from "react"
import { FilmIcon, Loader2Icon, PlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { FirstFrameItem } from "@/lib/api/video/first-frames"
import {
  createGeneration,
  deleteGenerations,
  getGenerationErrorMessage,
  insertGeneration,
  listGenerations,
  retryGeneration,
  VIDEO_DURATIONS,
  type GenerationItem,
} from "@/lib/api/video/generations"
import type { ProjectItem } from "@/lib/api/video/projects"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { VideoDurationSeconds } from "@/lib/video/asset-factories"

const ACTIVE = new Set(["queued", "processing"])

export function GenerationsDashboard({
  initial,
  frames,
  projects,
}: {
  initial: { generations: GenerationItem[] }
  frames: FirstFrameItem[]
  projects: ProjectItem[]
}) {
  const [items, setItems] = React.useState(initial.generations)
  const [refreshError, setRefreshError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "")
  const [firstFrameId, setFirstFrameId] = React.useState(frames[0]?.id ?? "")
  const [prompt, setPrompt] = React.useState("")
  const [duration, setDuration] = React.useState<VideoDurationSeconds>(4)
  const [busy, setBusy] = React.useState(false)
  const [retryingId, setRetryingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<GenerationItem | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [inserting, setInserting] = React.useState<GenerationItem | null>(null)
  const [insertProjectId, setInsertProjectId] = React.useState(projects[0]?.id ?? "")
  const [insertBusy, setInsertBusy] = React.useState(false)

  const hasActive = items.some((item) => ACTIVE.has(item.status))
  const refresh = React.useCallback(async () => {
    try {
      const result = await listGenerations()
      setItems(result.generations)
      setRefreshError(null)
    } catch (error) {
      setRefreshError(getGenerationErrorMessage(error))
    }
  }, [])

  React.useEffect(() => {
    if (!hasActive) return
    const timer = window.setInterval(() => void refresh(), 6_000)
    return () => window.clearInterval(timer)
  }, [hasActive, refresh])

  const visible = items.filter((item) =>
    `${item.prompt} ${item.project_name} ${item.status}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  async function submit() {
    if (!projectId || !firstFrameId || !prompt.trim()) {
      showErrorToast("Project, first frame, and direction are required.")
      return
    }
    setBusy(true)
    try {
      await createGeneration({ projectId, firstFrameId, prompt, durationSeconds: duration })
      const refreshed = await listGenerations()
      setItems(refreshed.generations)
      setCreating(false)
      setPrompt("")
      toast.success("Video queued. You can leave this page while it runs.")
    } catch (error) {
      showErrorToast(getGenerationErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function retry(item: GenerationItem) {
    setRetryingId(item.id)
    try {
      const updated = await retryGeneration(item.id)
      setItems((current) => current.map((row) => row.id === updated.id ? updated : row))
      toast.success("Video queued again. The failed attempt cost nothing.")
    } catch (error) {
      showErrorToast(getGenerationErrorMessage(error))
    } finally {
      setRetryingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deleteGenerations([deleting.id])
      setItems((current) => current.filter((item) => item.id !== deleting.id))
      setDeleting(null)
      toast.success("Generation removed. Its finished clip remains in Media.")
    } catch (error) {
      showErrorToast(getGenerationErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmInsert() {
    if (!inserting || !insertProjectId) return
    setInsertBusy(true)
    try {
      const result = await insertGeneration(inserting.id, insertProjectId)
      setInserting(null)
      toast.success(`AI clip added to ${result.project_name}.`)
    } catch (error) {
      showErrorToast(getGenerationErrorMessage(error))
    } finally {
      setInsertBusy(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="AI video generations"
        icon={<SparklesIcon className="text-muted-foreground" />}
        count={visible.length}
        error={refreshError ? { message: refreshError, onRetry: () => void refresh() } : undefined}
        controls={<><DashboardToolbarSearch aria-label="Search AI video generations" placeholder="Search generations" value={search} onChange={(event) => setSearch(event.target.value)} /><DashboardToolbarButton disabled={!frames.length || !projects.length} onClick={() => setCreating(true)}><PlusIcon /> Generate video</DashboardToolbarButton></>}
        content={visible.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-4">
            {visible.map((item) => (
              <Card key={item.id} size="sm" className="overflow-hidden">
                {item.output_url ? <video src={item.output_url} poster={item.first_frame_image_url ?? undefined} controls preload="metadata" className="aspect-video w-full bg-muted object-cover" /> : item.first_frame_image_url ? <div className="relative"><img src={item.first_frame_image_url} alt="Generation first frame" className="aspect-video w-full bg-muted object-cover" />{ACTIVE.has(item.status) ? <div className="absolute inset-0 grid place-items-center bg-background/60"><Loader2Icon className="size-7 animate-spin" /><span className="sr-only">Generating video</span></div> : null}</div> : <div className="grid aspect-video place-items-center bg-muted"><FilmIcon className="size-8 text-muted-foreground" /></div>}
                <CardHeader><div className="flex items-start justify-between gap-2"><CardTitle className="line-clamp-2">{item.prompt}</CardTitle><Badge variant={item.status === "error" ? "destructive" : "secondary"}>{item.status === "processing" ? "Generating" : item.status}</Badge></div></CardHeader>
                <CardContent className="grid gap-3">
                  <p className="text-sm text-muted-foreground">{item.project_name} · {item.duration_seconds}s · {item.aspect_ratio}</p>
                  {item.error_message ? <p role="alert" className="text-sm text-destructive">{item.error_message}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {item.status === "ready" ? <Button size="sm" onClick={() => setInserting(item)}><PlusIcon /> Add to project</Button> : null}
                    {item.status === "error" ? <Button size="sm" variant="outline" disabled={retryingId === item.id} onClick={() => void retry(item)}>{retryingId === item.id ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Retry</Button> : null}
                    <Button size="icon-sm" variant="outline" disabled={ACTIVE.has(item.status)} onClick={() => setDeleting(item)} aria-label={`Delete generation from ${item.project_name}`}><Trash2Icon /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <div className="grid min-h-56 place-items-center p-6 text-center text-sm text-muted-foreground">{frames.length && projects.length ? "No AI video clips yet." : "Create a project and a first frame before generating video."}</div>}
        footer={{ type: "summary", count: visible.length, label: "generations" }}
      />

      <FormDialog open={creating} dirty={Boolean(prompt)} busy={busy} onClose={() => setCreating(false)}>
        {(requestClose) => <DialogContent variant="admin"><DialogHeader><DialogTitle>Generate AI video</DialogTitle></DialogHeader><DialogBody><Card size="sm"><CardHeader><CardTitle>Video</CardTitle></CardHeader><CardContent className="grid gap-4"><div className="grid gap-2"><Label htmlFor="generation-project">Project</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger id="generation-project"><SelectValue placeholder="Choose a project" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="generation-frame">First frame</Label><Select value={firstFrameId} onValueChange={setFirstFrameId}><SelectTrigger id="generation-frame"><SelectValue placeholder="Choose a first frame" /></SelectTrigger><SelectContent>{frames.filter((frame) => ["9:16", "16:9"].includes(frame.aspect_ratio)).map((frame) => <SelectItem key={frame.id} value={frame.id}>{frame.name} · {frame.aspect_ratio}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="generation-direction">Movement and scene direction</Label><Textarea id="generation-direction" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Slow push in as the actor turns toward camera…" aria-invalid={!prompt.trim() || undefined} /></div><div className="grid gap-2"><Label htmlFor="generation-duration">Length</Label><Select value={String(duration)} onValueChange={(value) => setDuration(Number(value) as VideoDurationSeconds)}><SelectTrigger id="generation-duration"><SelectValue /></SelectTrigger><SelectContent>{VIDEO_DURATIONS.map((seconds) => <SelectItem key={seconds} value={String(seconds)}>{seconds} seconds</SelectItem>)}</SelectContent></Select></div></CardContent></Card></DialogBody><DialogFooter><Button variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Generate video</Button></DialogFooter></DialogContent>}
      </FormDialog>

      <Dialog open={inserting !== null} onOpenChange={(open) => { if (!open && !insertBusy) setInserting(null) }}><DialogContent variant="admin"><DialogHeader><DialogTitle>Add AI clip to project</DialogTitle></DialogHeader><DialogBody><Card size="sm"><CardContent className="grid gap-2"><Label htmlFor="generation-target">Project</Label><Select value={insertProjectId} onValueChange={setInsertProjectId}><SelectTrigger id="generation-target"><SelectValue /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></CardContent></Card></DialogBody><DialogFooter><Button variant="outline" disabled={insertBusy} onClick={() => setInserting(null)}>Cancel</Button><Button disabled={insertBusy || !insertProjectId} onClick={() => void confirmInsert()}>{insertBusy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add to project</Button></DialogFooter></DialogContent></Dialog>

      <ConfirmDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }} title="Delete generation?" description="The generation history is removed. A finished clip stays in Media and in every project that uses it." confirmLabel="Delete generation" loading={deleteBusy} onConfirm={() => void confirmDelete()} />
    </>
  )
}
