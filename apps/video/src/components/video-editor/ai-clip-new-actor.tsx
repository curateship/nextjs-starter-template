import { Loader2Icon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  type ActorItem,
} from "@/lib/api/video/actors"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { ImageModelId } from "@/lib/video/asset-factories"

const EMPTY_DRAFT = { name: "", prompt: "", model: DEFAULT_IMAGE_MODEL, photo: "" }

/**
 * New actor in step 1 of the AI clip panel: a box that drops down from the
 * button with the few things an actor needs, instead of the Actors
 * dashboard's full window. Status and tags are left to the dashboard. What is
 * typed is kept when the box shuts, until the actor is made.
 */
export function AiClipNewActor({
  projectId,
  primary,
  onMade,
}: {
  projectId: string
  /** The main button when there are no actors yet. */
  primary: boolean
  onMade: (actor: ActorItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  async function make() {
    setTried(true)
    if (!draft.name.trim() || !draft.prompt.trim()) return
    setBusy(true)
    try {
      const made = await createActor({
        name: draft.name,
        prompt: draft.prompt,
        model: draft.model,
        status: "active",
        tags: "",
        referenceMediaUrl: draft.photo || null,
        lookProjectId: projectId,
      })
      setDraft(EMPTY_DRAFT)
      setTried(false)
      setOpen(false)
      onMade(made)
    } catch (error) {
      showErrorToast(getActorErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant={primary ? "default" : "outline"}>
          <PlusIcon />
          New actor
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="New actor"
        className="w-[min(22rem,calc(100vw-2rem))] gap-3 p-3"
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void make()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="ai-clip-actor-name">Name</Label>
            <Input
              id="ai-clip-actor-name"
              autoFocus
              value={draft.name}
              maxLength={200}
              disabled={busy}
              aria-invalid={(tried && !draft.name.trim()) || undefined}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-clip-actor-description">Description</Label>
            <Textarea
              id="ai-clip-actor-description"
              rows={3}
              value={draft.prompt}
              maxLength={5000}
              disabled={busy}
              placeholder="A woman in her 30s with short dark hair"
              aria-invalid={(tried && !draft.prompt.trim()) || undefined}
              onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
            />
          </div>
          <div className="flex items-start gap-3">
            <ImageUpload
              label="Photo"
              value={draft.photo}
              onChange={(photo) => setDraft({ ...draft, photo })}
              aspect="square"
              fit="cover"
              disabled={busy}
              className="w-24 shrink-0"
            />
            <div className="grid min-w-0 flex-1 gap-2">
              <Label htmlFor="ai-clip-actor-model">Model</Label>
              <Select
                value={draft.model}
                disabled={busy}
                onValueChange={(model) => setDraft({ ...draft, model: model as ImageModelId })}
              >
                <SelectTrigger id="ai-clip-actor-model" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The photo is optional. A clear portrait keeps a real person's
                face.
              </p>
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Create actor
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
