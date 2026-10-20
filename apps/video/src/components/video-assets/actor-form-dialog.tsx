import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"

import { ImageUpload } from "@/components/shared/image-upload"
import { ActorSheetCard } from "@/components/video-assets/actor-sheet-card"
import { TagInput } from "@/components/video-assets/tag-input"
import { ProjectLookSelect } from "@/components/video-assets/project-look-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  getActorErrorMessage,
  IMAGE_MODELS,
  updateActor,
  type ActorItem,
  type ActorPayload,
} from "@/lib/api/video/actors"
import type { ProjectItem } from "@/lib/api/video/projects"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  normalizeAssetTags,
  type ImageModelId,
} from "@/lib/video/asset-factories"

type FormState = {
  name: string
  prompt: string
  model: ImageModelId
  status: "active" | "inactive"
  tags: string
  referenceMediaUrl: string
  /** A project id, or "" for no look. Used only when a picture is made. */
  lookProjectId: string
}

function startingForm(actor: ActorItem | null): FormState {
  if (!actor) {
    return {
      name: "",
      prompt: "",
      model: DEFAULT_IMAGE_MODEL,
      status: "active",
      tags: "",
      referenceMediaUrl: "",
      lookProjectId: "",
    }
  }
  return {
    name: actor.name,
    prompt: actor.prompt,
    model: actor.model,
    status: actor.status,
    tags: actor.tags.join(", "),
    referenceMediaUrl: actor.reference_media_url ?? "",
    lookProjectId: "",
  }
}

/**
 * Making or editing an actor on the Actors dashboard. The editor's AI clip
 * panel makes one from its own smaller box (`ai-clip-new-actor.tsx`).
 */
export function ActorFormDialog({
  open,
  actor,
  projects,
  onClose,
  onSaved,
  onSheetChanged,
}: {
  open: boolean
  /** Null makes a new actor. */
  actor: ActorItem | null
  /** The projects whose look a new picture can be made in. */
  projects: ProjectItem[]
  onClose: () => void
  /** Handed the saved actor and whether its picture was made again. */
  onSaved: (actor: ActorItem, reposed: boolean) => void
  /**
   * Handed the actor after a change to its character sheet, which saves on
   * its own. Only an actor being edited has a sheet to change.
   */
  onSheetChanged?: (actor: ActorItem) => void
}) {
  const [form, setForm] = React.useState<FormState>(() =>
    startingForm(actor)
  )
  const [busy, setBusy] = React.useState(false)
  const [regenerate, setRegenerate] = React.useState(false)

  // A fresh form every time the window opens, on whichever actor it opens on.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(startingForm(actor))
      setRegenerate(false)
    }
  }

  const dirty =
    JSON.stringify(form) !== JSON.stringify(startingForm(actor))

  async function submit(shouldRegenerate: boolean) {
    if (!form.name.trim() || !form.prompt.trim()) {
      showErrorToast("Name and description are required.")
      return
    }
    setRegenerate(shouldRegenerate)
    setBusy(true)
    try {
      const payload: ActorPayload = {
        ...form,
        referenceMediaUrl: form.referenceMediaUrl || null,
        lookProjectId: form.lookProjectId || null,
      }
      const saved = actor
        ? await updateActor(actor.id, payload, shouldRegenerate)
        : await createActor(payload)
      onSaved(saved, shouldRegenerate)
    } catch (error) {
      showErrorToast(getActorErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{actor ? "Edit actor" : "Create actor"}</DialogTitle>
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
            {actor && onSheetChanged ? (
              <ActorSheetCard actor={actor} onChange={onSheetChanged} />
            ) : null}
            <Card size="sm">
              <CardHeader><CardTitle>Generation</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap gap-4">
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
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="actor-tags">Tags</Label>
                  <TagInput
                    id="actor-tags"
                    value={normalizeAssetTags(form.tags)}
                    onChange={(tags) => setForm({ ...form, tags: tags.join(", ") })}
                    placeholder="Type a tag and press Enter"
                    disabled={busy}
                  />
                </div>
                <ProjectLookSelect
                  id="actor-look"
                  projects={projects}
                  value={form.lookProjectId}
                  onChange={(lookProjectId) => setForm({ ...form, lookProjectId })}
                  disabled={busy}
                />
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
            {actor ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(true)}>
                {busy && regenerate ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} Re-pose
              </Button>
            ) : null}
            <Button type="button" disabled={busy} onClick={() => void submit(false)}>
              {busy && !regenerate ? <Loader2Icon className="animate-spin" /> : null}
              {actor ? "Save changes" : "Create actor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
