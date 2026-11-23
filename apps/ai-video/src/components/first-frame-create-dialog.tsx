import * as React from "react"
import {
  ImageIcon,
  ImagePlusIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
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
      <Dialog
        open={open && !pickerOpen && !actorPickerOpen}
        onOpenChange={handleDialogOpenChange}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Create First Frame</DialogTitle>
            <DialogDescription>
              Generate a reference first frame for the selected actor.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FirstFrameNameAspectFields
                  name={name}
                  onNameChange={setName}
                  aspectRatio={aspectRatio}
                  aspectRatios={allowedAspectRatios}
                  onAspectRatioChange={setAspectRatio}
                  onSelectOpenChange={handleModalSelectOpenChange}
                />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Reference image</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel>Reference Source</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={
                        referenceSource === "actor" ? "default" : "outline"
                      }
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
                      variant={
                        referenceSource === "media" ? "default" : "outline"
                      }
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
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Prompt</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FirstFramePromptFields
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  tags={tags}
                  onTagsChange={setTags}
                  model={model}
                  onModelChange={setModel}
                  onSelectOpenChange={handleModalSelectOpenChange}
                />
              </CardContent>
            </Card>

            {modalError ? (
              <p role="alert" className="text-sm text-destructive">
                {modalError}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={closeDialog}
            >
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

      {referenceSource === "media" ? (
        <MediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelectMedia={handleReferenceSelect}
          currentMediaUrl={referenceMediaUrl ?? undefined}
          showVideos={false}
        />
      ) : null}

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
            <DialogDescription>
              Pick the actor whose image seeds this first frame.
            </DialogDescription>
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

// Name + aspect-ratio fields shared with the dashboard's edit modal.
export function FirstFrameNameAspectFields({
  name,
  onNameChange,
  aspectRatio,
  aspectRatios,
  onAspectRatioChange,
  onSelectOpenChange,
}: {
  name: string
  onNameChange: (value: string) => void
  aspectRatio: FirstFrameAspectRatio
  aspectRatios: readonly FirstFrameAspectRatio[]
  onAspectRatioChange: (value: FirstFrameAspectRatio) => void
  onSelectOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <div className="grid gap-2">
        <FieldLabel htmlFor="first-frame-name">Name</FieldLabel>
        <Input
          id="first-frame-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Opening shot in studio"
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel htmlFor="first-frame-aspect">Aspect Ratio</FieldLabel>
        <Select
          value={aspectRatio}
          onOpenChange={onSelectOpenChange}
          onValueChange={(value) =>
            onAspectRatioChange(value as FirstFrameAspectRatio)
          }
        >
          <SelectTrigger id="first-frame-aspect" className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {aspectRatios.map((ratio) => (
              <SelectItem key={ratio} value={ratio}>
                {ratio}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

// Prompt + tags + AI-model fields shared with the dashboard's edit modal.
export function FirstFramePromptFields({
  prompt,
  onPromptChange,
  tags,
  onTagsChange,
  model,
  onModelChange,
  onSelectOpenChange,
}: {
  prompt: string
  onPromptChange: (value: string) => void
  tags: string
  onTagsChange: (value: string) => void
  model: ActorModelId
  onModelChange: (value: ActorModelId) => void
  onSelectOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <div className="grid gap-2">
        <FieldLabel htmlFor="first-frame-prompt">Prompt</FieldLabel>
        <Textarea
          id="first-frame-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Describe the first frame composition, scene, pose, lighting, and mood."
          rows={1}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel htmlFor="first-frame-tags">Tags</FieldLabel>
          <Input
            id="first-frame-tags"
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder="hook, studio, closeup"
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="first-frame-model"
            hint={
              model === "dall-e-3"
                ? "DALL-E 3 uses text context only; reference images are not sent to this model."
                : undefined
            }
          >
            AI Model
          </FieldLabel>
          <Select
            value={model}
            onOpenChange={onSelectOpenChange}
            onValueChange={(value) => onModelChange(value as ActorModelId)}
          >
            <SelectTrigger id="first-frame-model" className="w-full sm:w-fit">
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
        </div>
      </div>
    </>
  )
}
