import * as React from "react"
import { FilmIcon, Loader2Icon, PinIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ActorItem } from "@/lib/api/video/actors"
import {
  ASSET_ASPECT_RATIOS,
  createFirstFrames,
  DEFAULT_IMAGE_MODEL,
  deleteFirstFrames,
  getFirstFrameErrorMessage,
  IMAGE_MODELS,
  insertFirstFrame,
  setFirstFramePinned,
  type FirstFrameItem,
  type FirstFramePayload,
} from "@/lib/api/video/first-frames"
import type { ProjectItem } from "@/lib/api/video/projects"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { AssetAspectRatio, GeminiImageModelId } from "@/lib/video/asset-factories"

type FormState = {
  name: string
  actorId: string
  prompt: string
  model: GeminiImageModelId
  aspectRatio: AssetAspectRatio
  tags: string
  referenceMediaUrl: string
  variants: number
}

function emptyForm(actorId = ""): FormState {
  return { name: "", actorId, prompt: "", model: DEFAULT_IMAGE_MODEL, aspectRatio: "9:16", tags: "", referenceMediaUrl: "", variants: 1 }
}

export function FirstFramesDashboard({
  initial,
  actors,
  projects,
  initialActorId,
}: {
  initial: { firstFrames: FirstFrameItem[] }
  actors: ActorItem[]
  projects: ProjectItem[]
  initialActorId?: string
}) {
  const [frames, setFrames] = React.useState(initial.firstFrames)
  const [search, setSearch] = React.useState("")
  const [creating, setCreating] = React.useState(Boolean(initialActorId))
  const [form, setForm] = React.useState<FormState>(emptyForm(initialActorId))
  const [initialForm, setInitialForm] = React.useState<FormState>(
    emptyForm(initialActorId)
  )
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState<FirstFrameItem | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [inserting, setInserting] = React.useState<FirstFrameItem | null>(null)
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "")
  const [insertBusy, setInsertBusy] = React.useState(false)

  const visible = frames.filter((frame) =>
    `${frame.name} ${frame.actor.name} ${frame.prompt} ${frame.tags.join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  async function submit() {
    if (!form.name.trim() || !form.actorId || !form.prompt.trim()) {
      showErrorToast("Name, actor, and direction are required.")
      return
    }
    setBusy(true)
    try {
      const payload: FirstFramePayload = {
        ...form,
        referenceMediaUrl: form.referenceMediaUrl || null,
      }
      const result = await createFirstFrames(payload)
      setFrames((current) => [...result.firstFrames, ...current])
      setCreating(false)
      setForm(emptyForm())
      if (result.warning) showErrorToast(result.warning)
      else toast.success(`${result.firstFrames.length} first frame${result.firstFrames.length === 1 ? "" : "s"} created.`)
    } catch (error) {
      showErrorToast(getFirstFrameErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function togglePin(frame: FirstFrameItem) {
    try {
      const updated = await setFirstFramePinned(frame.id, !frame.pinned)
      setFrames((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (error) {
      showErrorToast(getFirstFrameErrorMessage(error))
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deleteFirstFrames([deleting.id])
      setFrames((current) => current.filter((frame) => frame.id !== deleting.id))
      setDeleting(null)
      toast.success("First frame removed. Its picture remains in Media.")
    } catch (error) {
      showErrorToast(getFirstFrameErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmInsert() {
    if (!inserting || !projectId) return
    setInsertBusy(true)
    try {
      const result = await insertFirstFrame(inserting.id, projectId)
      setInserting(null)
      toast.success(`Opening image added to ${result.project_name}.`)
    } catch (error) {
      showErrorToast(getFirstFrameErrorMessage(error))
    } finally {
      setInsertBusy(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="First frames"
        icon={<FilmIcon className="text-muted-foreground" />}
        count={visible.length}
        controls={<><DashboardToolbarSearch aria-label="Search first frames" placeholder="Search first frames" value={search} onChange={(event) => setSearch(event.target.value)} /><DashboardToolbarButton onClick={() => { const next = emptyForm(actors[0]?.id); setForm(next); setInitialForm(next); setCreating(true) }} disabled={!actors.length}><PlusIcon /> Create first frame</DashboardToolbarButton></>}
        content={visible.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-4">
            {visible.map((frame) => (
              <Card key={frame.id} size="sm" className="overflow-hidden">
                <img src={frame.image_url} alt={frame.name} className="aspect-[9/12] w-full bg-muted object-cover" />
                <CardHeader><div className="flex items-start justify-between gap-2"><CardTitle>{frame.name}</CardTitle><span className="text-xs text-muted-foreground">{frame.aspect_ratio}</span></div></CardHeader>
                <CardContent className="grid gap-3">
                  <p className="text-sm text-muted-foreground">With {frame.actor.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setInserting(frame)} disabled={!projects.length}><PlusIcon /> Add to project</Button>
                    <Button size="icon-sm" variant={frame.pinned ? "default" : "outline"} aria-label={frame.pinned ? `Unpin ${frame.name}` : `Pin ${frame.name}`} onClick={() => void togglePin(frame)}><PinIcon /></Button>
                    <Button size="icon-sm" variant="outline" aria-label={`Delete ${frame.name}`} onClick={() => setDeleting(frame)}><Trash2Icon /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <div className="grid min-h-56 place-items-center p-6 text-center text-sm text-muted-foreground">{actors.length ? "No first frames yet. Generate an opening image from an actor." : "Create an actor before making a first frame."}</div>}
        footer={{ type: "summary", count: visible.length, label: "first frames" }}
      />

      <FormDialog open={creating} dirty={JSON.stringify(form) !== JSON.stringify(initialForm)} busy={busy} onClose={() => setCreating(false)}>
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader><DialogTitle>Create first frames</DialogTitle></DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardHeader><CardTitle>Opening image</CardTitle></CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2"><Label htmlFor="frame-name">Name</Label><Input id="frame-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-invalid={!form.name.trim() || undefined} /></div>
                  <div className="grid gap-2"><Label htmlFor="frame-actor">Actor</Label><Select value={form.actorId} onValueChange={(actorId) => setForm({ ...form, actorId })}><SelectTrigger id="frame-actor"><SelectValue placeholder="Choose an actor" /></SelectTrigger><SelectContent>{actors.map((actor) => <SelectItem key={actor.id} value={actor.id}>{actor.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label htmlFor="frame-direction">Direction</Label><Textarea id="frame-direction" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} placeholder="Close-up at a kitchen counter, warm morning light…" aria-invalid={!form.prompt.trim() || undefined} /></div>
                  <ImageUpload label="Different reference image" value={form.referenceMediaUrl} onChange={(value) => setForm({ ...form, referenceMediaUrl: value })} aspect="video" fit="contain" disabled={busy} className="max-w-48" hint="Optional. Otherwise the actor portrait is used." />
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader><CardTitle>Options</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2"><Label htmlFor="frame-model">Model</Label><Select value={form.model} onValueChange={(model) => setForm({ ...form, model: model as GeminiImageModelId })}><SelectTrigger id="frame-model"><SelectValue /></SelectTrigger><SelectContent>{IMAGE_MODELS.map((model) => <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label htmlFor="frame-aspect">Shape</Label><Select value={form.aspectRatio} onValueChange={(aspectRatio) => setForm({ ...form, aspectRatio: aspectRatio as AssetAspectRatio })}><SelectTrigger id="frame-aspect"><SelectValue /></SelectTrigger><SelectContent>{ASSET_ASPECT_RATIOS.map((ratio) => <SelectItem key={ratio} value={ratio}>{ratio}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label htmlFor="frame-variants">Variants</Label><Select value={String(form.variants)} onValueChange={(value) => setForm({ ...form, variants: Number(value) })}><SelectTrigger id="frame-variants"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((count) => <SelectItem key={count} value={String(count)}>{count}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label htmlFor="frame-tags">Tags</Label><Input id="frame-tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="launch, kitchen" /></div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Generate {form.variants}</Button></DialogFooter>
          </DialogContent>
        )}
      </FormDialog>

      <Dialog open={inserting !== null} onOpenChange={(open) => { if (!open && !insertBusy) setInserting(null) }}>
        <DialogContent variant="admin"><DialogHeader><DialogTitle>Add opening image to project</DialogTitle></DialogHeader><DialogBody><Card size="sm"><CardContent className="grid gap-2"><Label htmlFor="frame-project">Project</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger id="frame-project"><SelectValue placeholder="Choose a project" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></CardContent></Card></DialogBody><DialogFooter><Button variant="outline" disabled={insertBusy} onClick={() => setInserting(null)}>Cancel</Button><Button disabled={insertBusy || !projectId} onClick={() => void confirmInsert()}>{insertBusy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add to project</Button></DialogFooter></DialogContent>
      </Dialog>

      <ConfirmDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }} title="Delete first frame?" description="The first-frame record and any video-generation history that started from it are removed. Generated pictures and clips stay in Media and in projects that use them." confirmLabel="Delete first frame" loading={deleteBusy} onConfirm={() => void confirmDelete()} />
    </>
  )
}
