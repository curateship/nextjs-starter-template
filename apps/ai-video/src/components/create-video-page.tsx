import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  Loader2Icon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react"

import { MediaInput } from "@/components/media-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  createGeneration,
  draftUgcPrompt,
  getGenerationErrorMessage,
  getUgcWorkflow,
  type GenerationItem,
  type VideoGenerationSettings,
} from "@/lib/api/generations"
import { cn } from "@/lib/utils"

type StepId = "actor" | "product" | "script" | "voice"

const workflow = getUgcWorkflow()

export function CreateVideoPage() {
  const navigate = useNavigate()
  const [openSteps, setOpenSteps] = React.useState<Record<StepId, boolean>>({
    actor: true,
    product: false,
    script: false,
    voice: false,
  })
  const [actorImageUrl, setActorImageUrl] = React.useState("")
  const [actorNotes, setActorNotes] = React.useState("")
  const [productName, setProductName] = React.useState("")
  const [audience, setAudience] = React.useState("")
  const [offer, setOffer] = React.useState("")
  const [productNotes, setProductNotes] = React.useState("")
  const [productMediaUrl, setProductMediaUrl] = React.useState("")
  const [hook, setHook] = React.useState("")
  const [script, setScript] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [voiceTone, setVoiceTone] = React.useState("friendly creator")
  const [consentConfirmed, setConsentConfirmed] = React.useState(false)
  const [settings, setSettings] = React.useState<VideoGenerationSettings>(
    workflow.defaultSettings
  )
  const [generation, setGeneration] = React.useState<GenerationItem | null>(null)

  const draftMutation = useMutation({
    mutationFn: () =>
      draftUgcPrompt({
        actorImageUrl,
        actorNotes,
        productName,
        audience,
        offer,
        productNotes,
        productMediaUrl,
        hook,
        voiceTone,
      }),
    onSuccess: (draft) => {
      setHook(draft.hook)
      setScript(draft.script)
      setPrompt(draft.prompt)
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createGeneration({
        provider: "seedance",
        settings,
        input: {
          actorImageUrl,
          actorNotes,
          productName,
          audience,
          offer,
          productNotes,
          productMediaUrl,
          hook,
          script,
          prompt,
          voiceTone,
          consentConfirmed,
        },
      }),
    onSuccess: setGeneration,
  })

  const actorDone = Boolean(actorImageUrl && consentConfirmed)
  const productDone = Boolean(productName && audience && offer)
  const scriptDone = Boolean(script && prompt)
  const voiceDone = Boolean(voiceTone)
  const readyToGenerate = actorDone && productDone && scriptDone && voiceDone
  const error =
    draftMutation.error || createMutation.error
      ? getGenerationErrorMessage(draftMutation.error || createMutation.error)
      : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Create video</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a vertical UGC ad from actor, product, script, and voice inputs.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {workflow.label}
        </Badge>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        <StepCard
          id="actor"
          title="1. Select actor"
          summary={actorDone ? "Actor reference ready" : "Choose an actor reference image"}
          open={openSteps.actor}
          complete={actorDone}
          onOpenChange={(open) => setStepOpen("actor", open)}
        >
          <div className="space-y-4">
            <MediaInput
              label="Actor reference image"
              value={actorImageUrl}
              onChange={setActorImageUrl}
              acceptVideo={false}
              hideUrlInput
              description="Use an image you own or have permission to use."
            />
            <Field label="Actor notes">
              <Textarea
                value={actorNotes}
                onChange={(event) => setActorNotes(event.target.value)}
                placeholder="Creator age range, energy, wardrobe, camera style"
              />
            </Field>
            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={consentConfirmed}
                onCheckedChange={(checked) => setConsentConfirmed(Boolean(checked))}
              />
              <span>
                I own or have permission to use this actor/reference media for AI
                video generation.
              </span>
            </label>
            <StepActions
              disabled={!actorDone}
              onNext={() => setStepOpen("product", true)}
            />
          </div>
        </StepCard>

        <StepCard
          id="product"
          title="2. Add product"
          summary={productDone ? productName : "Add product, audience, and offer"}
          open={openSteps.product}
          complete={productDone}
          onOpenChange={(open) => setStepOpen("product", open)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Product name">
              <Input
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="Collagen gummies"
              />
            </Field>
            <Field label="Audience">
              <Input
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                placeholder="Busy women over 30"
              />
            </Field>
            <Field label="Offer">
              <Input
                value={offer}
                onChange={(event) => setOffer(event.target.value)}
                placeholder="20% off first order"
              />
            </Field>
            <Field label="Hook idea">
              <Input
                value={hook}
                onChange={(event) => setHook(event.target.value)}
                placeholder="Optional"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Product notes">
                <Textarea
                  value={productNotes}
                  onChange={(event) => setProductNotes(event.target.value)}
                  placeholder="Key benefits, proof points, objections, visual direction"
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <MediaInput
                label="Product/reference media"
                value={productMediaUrl}
                onChange={setProductMediaUrl}
                acceptVideo
                hideUrlInput
              />
            </div>
            <div className="md:col-span-2">
              <StepActions
                disabled={!productDone}
                onNext={() => setStepOpen("script", true)}
              />
            </div>
          </div>
        </StepCard>

        <StepCard
          id="script"
          title="3. Generate script"
          summary={scriptDone ? hook || "Script ready" : "Draft hook, script, and video prompt"}
          open={openSteps.script}
          complete={scriptDone}
          onOpenChange={(open) => setStepOpen("script", open)}
        >
          <div className="space-y-4">
            <Button
              type="button"
              onClick={() => draftMutation.mutate()}
              disabled={!actorDone || !productDone || draftMutation.isPending}
            >
              {draftMutation.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {draftMutation.isPending ? "Writing" : "Draft with AI"}
            </Button>
            <Field label="Hook">
              <Input
                value={hook}
                onChange={(event) => setHook(event.target.value)}
                placeholder="A thumb-stopping opening line"
              />
            </Field>
            <Field label="Script">
              <Textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                className="min-h-28"
                placeholder="Creator script"
              />
            </Field>
            <Field label="Editable video prompt">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-36"
                placeholder="Provider-ready video prompt"
              />
            </Field>
            <StepActions
              disabled={!scriptDone}
              onNext={() => setStepOpen("voice", true)}
            />
          </div>
        </StepCard>

        <StepCard
          id="voice"
          title="4. Add voice"
          summary={voiceDone ? voiceTone : "Choose provider-native voice direction"}
          open={openSteps.voice}
          complete={voiceDone}
          onOpenChange={(open) => setStepOpen("voice", open)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Voice tone">
              <Select value={voiceTone} onValueChange={setVoiceTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly creator">Friendly creator</SelectItem>
                  <SelectItem value="casual testimonial">Casual testimonial</SelectItem>
                  <SelectItem value="energetic demo">Energetic demo</SelectItem>
                  <SelectItem value="calm expert">Calm expert</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Aspect ratio">
              <Select
                value={settings.aspectRatio}
                onValueChange={(aspectRatio) =>
                  setSettings((current) => ({
                    ...current,
                    aspectRatio: aspectRatio as VideoGenerationSettings["aspectRatio"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 vertical</SelectItem>
                  <SelectItem value="1:1">1:1 square</SelectItem>
                  <SelectItem value="16:9">16:9 landscape</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Duration">
              <Select
                value={String(settings.durationSeconds)}
                onValueChange={(duration) =>
                  setSettings((current) => ({
                    ...current,
                    durationSeconds: Number(duration),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 seconds</SelectItem>
                  <SelectItem value="8">8 seconds</SelectItem>
                  <SelectItem value="10">10 seconds</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Resolution">
              <Select
                value={settings.resolution}
                onValueChange={(resolution) =>
                  setSettings((current) => ({
                    ...current,
                    resolution: resolution as VideoGenerationSettings["resolution"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm md:col-span-2">
              <Checkbox
                checked={settings.nativeAudio}
                onCheckedChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    nativeAudio: Boolean(checked),
                  }))
                }
              />
              Use provider-native audio when available.
            </label>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!readyToGenerate || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <VideoIcon className="size-4" />
                )}
                {createMutation.isPending ? "Starting" : "Generate video"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/admin/modules/ugc-ad-video" })}
              >
                View videos
              </Button>
            </div>
          </div>
        </StepCard>
      </div>

      {generation ? <GenerationStatus generation={generation} /> : null}
    </div>
  )

  function setStepOpen(step: StepId, open: boolean) {
    setOpenSteps((current) => ({ ...current, [step]: open }))
  }
}

function StepCard({
  title,
  summary,
  open,
  complete,
  onOpenChange,
  children,
}: {
  title: string
  summary: string
  open: boolean
  complete: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className={cn("rounded-lg border bg-card", open && "shadow-sm")}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                {complete ? (
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                ) : null}
                {title}
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {summary}
              </span>
            </span>
            <ChevronDownIcon
              className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-4 py-4">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function StepActions({
  disabled,
  onNext,
}: {
  disabled: boolean
  onNext: () => void
}) {
  return (
    <Button type="button" onClick={onNext} disabled={disabled}>
      Continue
    </Button>
  )
}

function GenerationStatus({ generation }: { generation: GenerationItem }) {
  const items = [
    ["Writing prompt", "done"],
    ["Generating video", generation.status === "failed" ? "failed" : "active"],
    ["Saving result", "pending"],
    ["Complete", generation.status === "succeeded" ? "done" : "pending"],
  ]
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">Generation started</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {items.map(([label, state]) => (
          <div key={label} className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium">{label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{state}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link
            to="/admin/modules/ugc-ad-video/generations/$generationId"
            params={{ generationId: generation.id }}
          >
            Open result
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/modules/ugc-ad-video">Back to module</Link>
        </Button>
      </div>
    </div>
  )
}
