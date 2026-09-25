import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, SettingsIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createActor,
  DEFAULT_IMAGE_MODEL,
  deleteActors,
  getActorErrorMessage,
  IMAGE_MODELS,
  updateActor,
  type ActorItem,
  type ActorPayload,
} from "@/lib/api/video/actors"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { ImageModelId } from "@/lib/video/asset-factories"

type FormState = {
  name: string
  prompt: string
  model: ImageModelId
  status: "active" | "inactive"
  tags: string
  referenceMediaUrl: string
}

const EMPTY_FORM: FormState = {
  name: "",
  prompt: "",
  model: DEFAULT_IMAGE_MODEL,
  status: "active",
  tags: "",
  referenceMediaUrl: "",
}

export function ActorsDashboard({ initial }: { initial: { actors: ActorItem[] } }) {
  const [actors, setActors] = React.useState(initial.actors)
  const [search, setSearch] = React.useState("")
  const [editing, setEditing] = React.useState<ActorItem | "new" | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = React.useState(false)
  const [regenerate, setRegenerate] = React.useState(false)
  const [deleting, setDeleting] = React.useState<ActorItem | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  const visible = actors.filter((actor) =>
    `${actor.name} ${actor.prompt} ${actor.tags.join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditing("new")
  }

  function openEdit(actor: ActorItem) {
    setForm({
      name: actor.name,
      prompt: actor.prompt,
      model: actor.model,
      status: actor.status,
      tags: actor.tags.join(", "),
      referenceMediaUrl: actor.reference_media_url ?? "",
    })
    setEditing(actor)
  }

  const initialForm =
    editing && editing !== "new"
      ? {
          name: editing.name,
          prompt: editing.prompt,
          model: editing.model,
          status: editing.status,
          tags: editing.tags.join(", "),
          referenceMediaUrl: editing.reference_media_url ?? "",
        }
      : EMPTY_FORM
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm)

  async function submit(shouldRegenerate = false) {
    if (!form.name.trim() || !form.prompt.trim()) {
      showErrorToast("Name and description are required.")
      return
    }
    setBusy(true)
    try {
      const payload: ActorPayload = {
        ...form,
        referenceMediaUrl: form.referenceMediaUrl || null,
      }
      if (editing === "new") {
        const created = await createActor(payload)
        setActors((current) => [created, ...current])
        toast.success("Actor created.")
      } else if (editing) {
        const updated = await updateActor(editing.id, payload, shouldRegenerate)
        setActors((current) =>
          current.map((actor) => (actor.id === updated.id ? updated : actor))
        )
        toast.success(shouldRegenerate ? "Actor re-posed." : "Actor saved.")
      }
      setEditing(null)
      setRegenerate(false)
    } catch (error) {
      showErrorToast(getActorErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deleteActors([deleting.id])
      setActors((current) => current.filter((actor) => actor.id !== deleting.id))
      setDeleting(null)
      toast.success("Actor removed. Its generated files remain in Media.")
    } catch (error) {
      showErrorToast(getActorErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Actors"
        icon={<SparklesIcon className="text-muted-foreground" />}
        count={visible.length}
        controls={
          <>
            <DashboardToolbarSearch
              aria-label="Search actors"
              placeholder="Search actors"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton onClick={openCreate}>
              <PlusIcon /> Create actor
            </DashboardToolbarButton>
          </>
        }
        content={
          visible.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-4">
              {visible.map((actor) => (
                <Card key={actor.id} size="sm" className="overflow-hidden">
                  <img
                    src={actor.image_url}
                    alt={actor.name}
                    className="aspect-[3/4] w-full bg-muted object-cover"
                  />
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{actor.name}</CardTitle>
                      <Badge variant="secondary">{actor.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {actor.prompt}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link
                          to="/admin/video-editor/first-frames"
                          search={{ actor: actor.id }}
                        >
                          <SparklesIcon /> Make first frame
                        </Link>
                      </Button>
                      <Button size="icon-sm" variant="outline" onClick={() => openEdit(actor)} aria-label={`Edit ${actor.name}`}>
                        <SettingsIcon />
                      </Button>
                      <Button size="icon-sm" variant="outline" onClick={() => setDeleting(actor)} aria-label={`Delete ${actor.name}`}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center p-6 text-center text-sm text-muted-foreground">
              {search ? "No actors match that search." : "No actors yet. Create one from a description or reference photo."}
            </div>
          )
        }
        footer={{ type: "summary", count: visible.length, label: "actors" }}
      />

      <FormDialog
        open={editing !== null}
        dirty={dirty}
        busy={busy}
        onClose={() => {
          setEditing(null)
          setRegenerate(false)
        }}
      >
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Create actor" : "Edit actor"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardHeader><CardTitle>Character</CardTitle></CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="actor-name">Name</Label>
                    <Input id="actor-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-invalid={!form.name.trim() || undefined} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="actor-description">Description or new pose</Label>
                    <Textarea id="actor-description" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} aria-invalid={!form.prompt.trim() || undefined} />
                  </div>
                  <ImageUpload
                    label="Reference photo"
                    value={form.referenceMediaUrl}
                    onChange={(value) => setForm({ ...form, referenceMediaUrl: value })}
                    aspect="square"
                    fit="cover"
                    disabled={busy}
                    className="max-w-32"
                    hint="Optional. Use a clear portrait to preserve a real person's appearance."
                  />
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader><CardTitle>Generation</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="actor-model">Model</Label>
                    <Select value={form.model} onValueChange={(model) => setForm({ ...form, model: model as ImageModelId })}>
                      <SelectTrigger id="actor-model"><SelectValue /></SelectTrigger>
                      <SelectContent>{IMAGE_MODELS.map((model) => <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="actor-status">Status</Label>
                    <Select value={form.status} onValueChange={(status) => setForm({ ...form, status: status as FormState["status"] })}>
                      <SelectTrigger id="actor-status"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="actor-tags">Tags</Label>
                    <Input id="actor-tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="host, product, casual" />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
              {editing !== "new" ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => { setRegenerate(true); void submit(true) }}>
                  {busy && regenerate ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Re-pose
                </Button>
              ) : null}
              <Button type="button" disabled={busy} onClick={() => { setRegenerate(false); void submit(false) }}>
                {busy && !regenerate ? <Loader2Icon className="animate-spin" /> : null}
                {editing === "new" ? "Create actor" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="Delete actor?"
        description="The actor, its first-frame records, and their generation history are removed. Every generated picture and clip stays in Media and in projects that use it."
        confirmLabel="Delete actor"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
