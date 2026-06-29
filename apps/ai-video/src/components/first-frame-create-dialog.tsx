import * as React from "react"
import {
  AlertCircleIcon,
  ImageIcon,
  ImagePlusIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  ACTOR_MODELS,
  createFirstFrame,
  DEFAULT_ACTOR_MODEL,
  FIRST_FRAME_ASPECT_RATIOS,
  getFirstFrameErrorMessage,
  type ActorModelId,
  type FirstFrameAspectRatio,
  type FirstFrameItem,
  type FirstFrameReferenceSource,
} from "@/lib/api/first-frames"
import type { ActorItem } from "@/lib/api/actors"
import type { MediaItem } from "@/lib/api/media"
import { cn } from "@/lib/utils"

export type FirstFrameCreateDialogInitialValues = {
  name?: string
  actorId?: string
  prompt?: string
  tags?: string | string[]
  model?: ActorModelId
  aspectRatio?: FirstFrameAspectRatio
  referenceSource?: FirstFrameReferenceSource
  referenceMediaId?: string | null
  referenceMediaUrl?: string | null
}

export function FirstFrameCreateDialog({
  open,
  onOpenChange,
  actors,
  initialValues,
  defaultAspectRatio = "9:16",
  allowedAspectRatios = FIRST_FRAME_ASPECT_RATIOS,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  actors: ActorItem[]
  initialValues?: FirstFrameCreateDialogInitialValues | null
  defaultAspectRatio?: FirstFrameAspectRatio
  allowedAspectRatios?: readonly FirstFrameAspectRatio[]
  onCreated?: (item: FirstFrameItem) => void
}) {
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [actorPickerOpen, setActorPickerOpen] = React.useState(false)
  const [actorPickerQuery, setActorPickerQuery] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [name, setName] = React.useState("")
  const [actorId, setActorId] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [model, setModel] = React.useState<ActorModelId>(DEFAULT_ACTOR_MODEL)
  const [aspectRatio, setAspectRatio] =
    React.useState<FirstFrameAspectRatio>(defaultAspectRatio)
  const [referenceSource, setReferenceSource] =
    React.useState<FirstFrameReferenceSource>("actor")
  const [referenceMediaId, setReferenceMediaId] = React.useState<string | null>(
    null
  )
  const [referenceMediaUrl, setReferenceMediaUrl] = React.useState<
    string | null
  >(null)
  const ignoreModalCloseRef = React.useRef(false)

  React.useEffect(() => {
    if (!open) return
    let active = true
    Promise.resolve().then(() => {
      if (!active) return
      setModalError(null)
      setPickerOpen(false)
      setActorPickerOpen(false)
      setActorPickerQuery("")
      setSubmitting(false)
      setName(initialValues?.name ?? "")
      setActorId(initialValues?.actorId ?? "")
      setPrompt(initialValues?.prompt ?? "")
      setTags(normalizeTags(initialValues?.tags))
      setModel(initialValues?.model ?? DEFAULT_ACTOR_MODEL)
      setAspectRatio(initialValues?.aspectRatio ?? defaultAspectRatio)
      setReferenceSource(initialValues?.referenceSource ?? "actor")
      setReferenceMediaId(initialValues?.referenceMediaId ?? null)
      setReferenceMediaUrl(initialValues?.referenceMediaUrl ?? null)
    })
    return () => {
      active = false
    }
  }, [defaultAspectRatio, initialValues, open])

  const actorOptions = React.useMemo(
    () => actors.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [actors]
  )

  const actorPickerOptions = React.useMemo(() => {
    const query = actorPickerQuery.trim().toLowerCase()
    if (!query) return actorOptions
    return actorOptions.filter((actor) =>
      actor.name.toLowerCase().includes(query)
    )
  }, [actorOptions, actorPickerQuery])

  const selectedActor = actors.find((actor) => actor.id === actorId) ?? null
  const referencePreviewUrl =
    referenceSource === "media" ? referenceMediaUrl : selectedActor?.image_url
  const generateDisabled =
    submitting ||
    !name.trim() ||
    !actorId ||
    !prompt.trim() ||
    (referenceSource === "media" && !referenceMediaId)

  function handleDialogOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    if (!ignoreModalCloseRef.current) closeDialog()
  }

  function closeDialog() {
    ignoreModalCloseRef.current = false
    setPickerOpen(false)
    setActorPickerOpen(false)
    setActorPickerQuery("")
    setModalError(null)
    setSubmitting(false)
    onOpenChange(false)
  }

  function ignoreNextModalClose() {
    ignoreModalCloseRef.current = true
    window.setTimeout(() => {
      ignoreModalCloseRef.current = false
    }, 300)
  }

  function closeActorPicker() {
    ignoreNextModalClose()
    setActorPickerOpen(false)
    setActorPickerQuery("")
  }

  function handleModalSelectOpenChange(open: boolean) {
    if (open) return
    ignoreNextModalClose()
  }

  function clearReferenceMedia() {
    setReferenceMediaId(null)
    setReferenceMediaUrl(null)
  }

  function handleReferenceSelect(
    mediaUrl: string,
    _altText?: string,
    media?: MediaItem
  ) {
    if (!mediaUrl || !media) {
      clearReferenceMedia()
      return
    }
    setReferenceSource("media")
    setReferenceMediaId(media.id)
    setReferenceMediaUrl(media.url)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setModalError(null)
    try {
      const created = await createFirstFrame({
        name,
        actorId,
        prompt,
        tags,
        model,
        aspectRatio,
        referenceSource,
        referenceMediaId,
      })
      onCreated?.(created)
      closeDialog()
    } catch (submitError) {
      setModalError(getFirstFrameErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Create First Frame</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              {modalError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="first-frame-name">Name</Label>
                <Input
                  id="first-frame-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Opening shot in studio"
                />
              </div>

              <div className="grid gap-2">
                <Label>Aspect Ratio</Label>
                <Select
                  value={aspectRatio}
                  onOpenChange={handleModalSelectOpenChange}
                  onValueChange={(value) =>
                    setAspectRatio(value as FirstFrameAspectRatio)
                  }
                >
                  <SelectTrigger id="first-frame-aspect" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedAspectRatios.map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Reference Source</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={referenceSource === "actor" ? "default" : "outline"}
                    size="sm"
                    aria-pressed={referenceSource === "actor"}
                    onClick={() => {
                      setPickerOpen(false)
                      setReferenceSource("actor")
                    }}
                  >
                    Actor image
                  </Button>
                  <Button
                    type="button"
                    variant={referenceSource === "media" ? "default" : "outline"}
                    size="sm"
                    aria-pressed={referenceSource === "media"}
                    onClick={() => setReferenceSource("media")}
                  >
                    Media library image
                  </Button>
                </div>
                <div className="grid w-full max-w-52 gap-2">
                  <button
                    type="button"
                    className="group relative cursor-pointer overflow-hidden rounded-lg border-2 border-dashed text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() =>
                      referenceSource === "actor"
                        ? setActorPickerOpen(true)
                        : setPickerOpen(true)
                    }
                    aria-label={
                      referenceSource === "actor"
                        ? "Select actor image"
                        : "Select media library image"
                    }
                  >
                    {referencePreviewUrl ? (
                      <div className="relative aspect-square">
                        <img
                          src={referencePreviewUrl}
                          alt="Reference"
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="text-sm font-medium text-white">
                            Click to change
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-muted/50 transition-colors group-hover:bg-muted">
                        <ImagePlusIcon className="size-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Select image
                        </span>
                      </div>
                    )}
                  </button>
                  {referenceSource === "media" && referenceMediaUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit text-destructive hover:text-destructive"
                      onClick={clearReferenceMedia}
                    >
                      Remove image
                    </Button>
                  ) : null}
                  {referenceSource === "media" ? (
                    <MediaPicker
                      open={pickerOpen}
                      onOpenChange={setPickerOpen}
                      onSelectMedia={handleReferenceSelect}
                      currentMediaUrl={referenceMediaUrl ?? undefined}
                      showVideos={false}
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="first-frame-prompt">Prompt</Label>
                <Textarea
                  id="first-frame-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the first frame composition, scene, pose, lighting, and mood."
                  rows={5}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="first-frame-tags">Tags</Label>
                  <Input
                    id="first-frame-tags"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="hook, studio, closeup"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>AI Model</Label>
                  <Select
                    value={model}
                    onOpenChange={handleModalSelectOpenChange}
                    onValueChange={(value) => setModel(value as ActorModelId)}
                  >
                    <SelectTrigger id="first-frame-model" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTOR_MODELS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {model === "dall-e-3" ? (
                    <p className="text-xs text-muted-foreground">
                      DALL-E 3 uses text context only; reference images are not sent to this model.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={generateDisabled}
              onClick={handleSubmit}
            >
              {submitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {submitting ? "Generating" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={actorPickerOpen}
        onOpenChange={(next) => {
          if (next) {
            setActorPickerOpen(true)
            return
          }
          closeActorPicker()
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Select Actor Image</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <Input
                type="search"
                value={actorPickerQuery}
                onChange={(event) => setActorPickerQuery(event.target.value)}
                placeholder="Search actors"
              />
              <div className="min-h-[260px] overflow-y-auto rounded-lg border p-3">
                {actorPickerOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {actorPickerOptions.map((actor) => (
                      <button
                        key={actor.id}
                        type="button"
                        className={cn(
                          "overflow-hidden rounded-md border bg-muted text-left outline-none transition-colors hover:border-muted-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                          actorId === actor.id &&
                            "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => {
                          setActorId(actor.id)
                          setReferenceSource("actor")
                          setPickerOpen(false)
                          closeActorPicker()
                        }}
                      >
                        <img
                          src={actor.image_url}
                          alt={actor.name}
                          className="aspect-square w-full object-cover"
                        />
                        <span className="block truncate px-2 py-1.5 text-xs">
                          {actor.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground">
                    <div>
                      <ImageIcon className="mx-auto mb-3 size-10" />
                      <p>No actors found.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={closeActorPicker}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function normalizeTags(value: string | string[] | undefined) {
  if (!value) return ""
  return Array.isArray(value) ? value.join(", ") : value
}
