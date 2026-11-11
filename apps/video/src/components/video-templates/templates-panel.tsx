import * as React from "react"
import {
  GalleryHorizontalIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  PinIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { InspectorCard } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BriefStoryboard } from "@/components/video-editor/brief-to-video"
import { useBriefProgress, useBriefs } from "@/components/video-editor/briefs-context"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import { TemplateMenu } from "@/components/video-templates/template-menu"
import {
  dropTemplate,
  keepTemplate,
  pickTemplate,
  useTemplatePick,
  useTemplates,
  useWriter,
} from "@/components/video-templates/template-store"
import { listCarouselProjects } from "@/lib/api/video/carousel-projects"
import { listVideos } from "@/lib/api/video/project-videos"
import {
  carouselFromScript,
  createTemplate,
  getTemplateErrorMessage,
  saveVideoTemplateCard,
  writeTemplateBrief,
  type TemplateItem,
  type VideoTemplateCard,
} from "@/lib/api/video/templates"
import type { WriterId } from "@/lib/video/ai-choices"
import { formatAiEstimate, writerCostCents, withEstimate } from "@/lib/video/ai-estimates"
import { CAROUSEL_FORMATS, type CarouselFormat } from "@/lib/video/carousel-schema"
import { CAROUSEL_SLIDE_COUNT } from "@/lib/video/carousel-writing"
import { countWords } from "@/lib/video/script-check"
import {
  TEMPLATE_DESCRIBE_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_SCRIPT_MAX,
  readingSeconds,
  readScriptBlocks,
  spokenScript,
  templateScriptCostCents,
  withChanges,
} from "@/lib/video/templates"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useSaveAfterTyping } from "@/components/video-editor/use-save-after-typing"
import { LengthCounter } from "@/components/video-assets/length-counter"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { PINNED_ICON_CLASS } from "@/lib/video/pinned-look"

/**
 * The Templates panel on the editor's left menu (`workspace/docs/templates.md`).
 * Tyler, 5 Nov 2026: "Plan > create a plan > modal > name, select template,
 * paste a script > brief to video button > Ai will create a video based on
 * brief", then "Lets call plan "Templates"".
 *
 * It lists the person's templates, each with the edit dropdown on its cog; a
 * click on one picks it for the open video. The video's own fields, its
 * script and Generate video moved to the header's template dropdown on
 * 5 Nov 2026 (template-header-menu.tsx), and are drawn by
 * `VideoTemplateFields` below.
 */

const SAVE_DELAY_MS = 700
/**
 * A select or tab row that shrinks with the panel and cuts its words short,
 * instead of holding the panel open at the width of its longest words.
 */
const NARROW_FIELD = "w-full min-w-0 *:data-[slot=select-value]:min-w-0"
const NO_TAG = "all"

export function TemplatesPanel() {
  const { videoId } = useEditorRuntime()
  // Shared with the inspector's Template card (template-store.ts).
  const templates = useTemplates()
  const picked = useTemplatePick(videoId)
  const writer = useWriter()
  const pickedId = picked ?? null
  const pick = (templateId: string | null) => pickTemplate(videoId, templateId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<LayoutTemplateIcon className="size-4" />}
        title="Templates"
        action={
          <NewTemplateMenu
            templates={templates ?? []}
            writer={writer}
            onMade={(made) => {
              keepTemplate(made)
              if (picked === null) void pick(made.id)
            }}
          />
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {/* The video's script and Generate video live in the header's
              template dropdown since 5 Nov 2026 (template-header-menu.tsx). */}
          {templates ? (
            <TemplateList
              templates={templates}
              pickedId={pickedId}
              writer={writer}
              onPick={(templateId) => void pick(templateId)}
              onSaved={keepTemplate}
              onDuplicated={keepTemplate}
              onDeleted={dropTemplate}
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

// ----------------------------------------------------------- The video ------

/**
 * The header's template dropdown: the template picked with a cog that opens
 * this video's settings in a window, the script box, then a footer that
 * stays at the dropdown's foot with Generate video. Tyler, 5 Nov 2026, pointing at the old "This video" card:
 * "this should be there. Aslo add a sticky footer with the "Generate video"
 * button".
 */
export function VideoTemplateFields({
  card,
  pickedId,
  templates,
  writer,
  onPick,
  onCard,
  onEditTemplate,
}: {
  card: VideoTemplateCard
  pickedId: string | null
  templates: TemplateItem[]
  writer: WriterId | null
  onPick: (templateId: string | null) => void
  onCard: (card: VideoTemplateCard) => void
  /** The cog beside the picker: opens the picked template's settings. */
  onEditTemplate?: () => void
}) {
  const { videoId, store } = useEditorRuntime()
  const { refreshSpend } = useProjectSettings()
  const briefs = useBriefs()
  const progress = useBriefProgress()
  const template = templates.find((one) => one.id === pickedId) ?? null
  const [script, setScript] = React.useState(card.script)
  const [busy, setBusy] = React.useState(false)
  const [storyboard, setStoryboard] = React.useState<string | null>(null)
  const [scriptInvalid, setScriptInvalid] = React.useState(false)
  const { later } = useSaveAfterTyping(SAVE_DELAY_MS)
  const pending = React.useRef<{ script?: string }>({})

  function save() {
    const patch = pending.current
    pending.current = {}
    if (patch.script === undefined) return
    saveVideoTemplateCard({ videoId, ...patch })
      .then(onCard)
      .catch((error: unknown) => showErrorToast(getTemplateErrorMessage(error)))
  }

  function typeScript(next: string) {
    setScript(next)
    setScriptInvalid(false)
    pending.current = { ...pending.current, script: next }
    later(save)
  }

  // The video's own copy of the template's settings (templates.md).
  const fields = template ? withChanges(template.fields, card.changes) : null
  // Only a pasted script: the "Write it for me" tab came off on 5 Nov 2026
  // (Tyler: "Remove the write it for me tab ... that is already in the
  // "Intructions" in the modal").
  const words = spokenScript(script)
  const speed = fields?.voice?.settings.speed ?? 1
  const seconds = Math.round(readingSeconds(words, speed))
  const ownBreaks = readScriptBlocks(script).length > 1
  const scriptCents = fields ? templateScriptCostCents(writer, fields, script) : 0
  const latest = briefs?.briefs?.[0] ?? null
  const open = briefs?.briefs?.find((brief) => brief.id === storyboard) ?? null

  function requireReady() {
    if (!template) {
      showErrorToast("Pick a template for this video first.")
      return false
    }
    if (!script.trim()) {
      setScriptInvalid(true)
      showErrorToast("Paste a script first.")
      return false
    }
    return true
  }

  async function brief() {
    if (!requireReady() || store.refuseIfLocked()) return
    setBusy(true)
    try {
      save()
      const written = await writeTemplateBrief({ videoId, text: script })
      briefs?.replace(written)
      refreshSpend()
      setStoryboard(written.id)
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="@container/video-card grid min-w-0 grid-cols-1 gap-4 p-2 pb-4 text-sm">
        <div className="grid gap-2">
          <Label htmlFor="video-template-pick">Template</Label>
          <div className="flex min-w-0 items-center gap-2">
            <Select value={pickedId ?? ""} onValueChange={(next) => onPick(next || null)}>
              <SelectTrigger id="video-template-pick" className={cn(NARROW_FIELD, "flex-1")}>
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((one) => (
                  <SelectItem key={one.id} value={one.id}>
                    {one.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* This video's own settings open in a window (Tyler, 5 Nov 2026:
                "All of these should be open via a settings cog here clicking
                on it opens a modal", then "changing anything in the dropdown
                is ONLY for the the currant video"). */}
            {template && onEditTemplate ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label="This video's settings"
                    onClick={onEditTemplate}
                  >
                    <SettingsIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>This video&apos;s settings</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="video-template-script">Script</Label>
          <Textarea
            id="video-template-script"
            rows={4}
            maxLength={TEMPLATE_SCRIPT_MAX}
            value={script}
            aria-invalid={scriptInvalid || undefined}
            placeholder="Paste your script. A blank line or --- starts a new scene, and [show: me at my desk] picks a scene's picture."
            onChange={(event) => typeScript(event.target.value)}
          />
          <LengthCounter length={script.length} max={TEMPLATE_SCRIPT_MAX} />
          {words ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {countWords(words)} words, about {seconds} seconds read aloud.{" "}
              {ownBreaks ? "Your breaks cut the scenes." : "The app cuts the scenes at sentence ends."}
            </p>
          ) : null}
        </div>


        {latest ? (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground [overflow-wrap:anywhere]" role="status">
              {progress ??
                (latest.status === "draft"
                  ? `"${latest.title}" is written. Check the scenes, then press Make it.`
                  : latest.status === "stopped"
                    ? `"${latest.title}" stopped at a scene that failed.`
                    : `"${latest.title}" is made.`)}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setStoryboard(latest.id)}>
              Storyboard
            </Button>
          </div>
        ) : null}

        {script.trim() ? <CarouselFromScript script={script} writer={writer} /> : null}
      </div>
      {/* Stays at the dropdown's foot while the fields above scroll. */}
      <div className="sticky bottom-0 z-10 -mx-2 -mb-2 grid gap-1 border-t bg-popover p-2">
        <Button type="button" className="w-full min-w-0" disabled={busy} onClick={() => void brief()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          <span className="truncate">
            {busy ? "Writing the scenes…" : withEstimate("Generate video", template && writer ? scriptCents : null)}
          </span>
        </Button>
        {template && !writer ? (
          <p className="text-xs text-muted-foreground">Generating needs a Gemini, OpenAI or Anthropic key in Settings → AI.</p>
        ) : null}
      </div>
      {open ? (
        <BriefStoryboard
          key={open.id}
          brief={open}
          briefs={briefs?.briefs ?? []}
          onPick={setStoryboard}
          onClose={() => setStoryboard(null)}
        />
      ) : null}
    </>
  )
}

/** The same script as a carousel (part 37), in a carousel project picked here. */
function CarouselFromScript({ script, writer }: { script: string; writer: WriterId | null }) {
  const { videoId } = useEditorRuntime()
  const [open, setOpen] = React.useState(false)
  const [projects, setProjects] = React.useState<{ id: string; name: string }[] | null>(null)
  const [into, setInto] = React.useState("")
  const [slides, setSlides] = React.useState<number>(CAROUSEL_SLIDE_COUNT.start)
  const [format, setFormat] = React.useState<CarouselFormat>("4:5")
  const [busy, setBusy] = React.useState(false)
  const cents = writer ? writerCostCents(writer, 1_500 + spokenScript(script).length, 1_500) : null

  React.useEffect(() => {
    if (!open) return
    let active = true
    listCarouselProjects({ pageSize: 100 })
      .then((loaded) => {
        if (active) setProjects(loaded.projects.map((project) => ({ id: project.id, name: project.name })))
      })
      .catch(() => {
        if (active) setProjects([])
      })
    return () => {
      active = false
    }
  }, [open])

  async function make() {
    if (!into) {
      showErrorToast("Pick the carousel project to put it in.")
      return
    }
    setBusy(true)
    try {
      await carouselFromScript({
        videoId,
        carouselProjectId: into,
        script: spokenScript(script),
        slideCount: slides,
        format,
      })
      setOpen(false)
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="max-w-full min-w-0 justify-self-start">
          <GalleryHorizontalIcon />
          <span className="truncate">Make it a carousel too</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="studio-root w-72 p-3">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="template-carousel-into">Carousel project</Label>
            <Select value={into} onValueChange={setInto}>
              <SelectTrigger id="template-carousel-into" className={NARROW_FIELD}>
                <SelectValue placeholder={projects === null ? "Fetching…" : projects.length ? "Pick one" : "No carousel projects yet"} />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              id="template-carousel-slides"
              label="Slides"
              value={slides}
              min={CAROUSEL_SLIDE_COUNT.min}
              max={CAROUSEL_SLIDE_COUNT.max}
              onChange={setSlides}
            />
            <div className="grid gap-2">
              <Label htmlFor="template-carousel-shape">Shape</Label>
              <Select value={format} onValueChange={(next) => setFormat(next as CarouselFormat)}>
                <SelectTrigger id="template-carousel-shape">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAROUSEL_FORMATS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="button" disabled={busy} onClick={() => void make()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {withEstimate("Write the carousel", cents)}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ------------------------------------------------------- The templates ------

function TemplateList({
  templates,
  pickedId,
  writer,
  onPick,
  onSaved,
  onDuplicated,
  onDeleted,
}: {
  templates: TemplateItem[]
  pickedId: string | null
  writer: WriterId | null
  onPick: (templateId: string) => void
  onSaved: (template: TemplateItem) => void
  onDuplicated: (template: TemplateItem) => void
  onDeleted: (templateId: string) => void
}) {
  const [tag, setTag] = React.useState(NO_TAG)
  const tags = [...new Set(templates.flatMap((one) => one.tags))].sort((a, b) => a.localeCompare(b))
  const shown = tag === NO_TAG || !tags.includes(tag) ? templates : templates.filter((one) => one.tags.includes(tag))

  return (
    <InspectorCard storageId="video-templates-list" title="Your templates">
      <div className="grid min-w-0 grid-cols-1 gap-3">
        {tags.length ? (
          <Select value={tags.includes(tag) ? tag : NO_TAG} onValueChange={setTag}>
            <SelectTrigger aria-label="Show templates tagged" className={NARROW_FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TAG}>Every tag</SelectItem>
              {tags.map((one) => (
                <SelectItem key={one} value={one}>
                  {one}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {shown.length ? (
          <ul className="grid min-w-0 grid-cols-1 gap-2">
            {shown.map((template) => (
              <li
                key={template.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-card p-2",
                  template.id === pickedId && "border-primary/60"
                )}
              >
                <button
                  type="button"
                  className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", focusRingInset)}
                  aria-pressed={template.id === pickedId}
                  onClick={() => onPick(template.id)}
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                    {template.cover_url ? (
                      <img src={template.cover_url} alt="" className="size-full object-cover" />
                    ) : (
                      <LayoutTemplateIcon className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-xs font-medium">
                      <span className="truncate">{template.name}</span>
                      {/* Yellow, the shell's favourite colour; Tyler, 5 Nov 2026: "make this yellow". */}
                      {template.pinned ? (
                        <PinIcon aria-label="Pinned" className={cn("size-3 shrink-0", PINNED_ICON_CLASS)} />
                      ) : null}
                    </span>
                    <span className="block truncate text-xs leading-4 text-muted-foreground">
                      {formatAiEstimate(template.typical_cents)} a video
                      {template.tags.length ? ` · ${template.tags.join(", ")}` : ""}
                    </span>
                  </span>
                </button>
                <TemplateMenu
                  template={template}
                  writer={writer}
                  onSaved={onSaved}
                  onDuplicated={onDuplicated}
                  onDeleted={onDeleted}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {templates.length ? "No template has that tag." : "No templates yet. Press + to make one."}
          </p>
        )}
      </div>
    </InspectorCard>
  )
}

type StartFrom = "blank" | "ai" | "video" | "reference"

/** New template (part 3): a dropdown under the +, the way New video's is, never a window. */
function NewTemplateMenu({
  templates,
  writer,
  onMade,
}: {
  templates: TemplateItem[]
  writer: WriterId | null
  onMade: (template: TemplateItem) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="New template">
              <PlusIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>New template</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="studio-root w-72 p-3">
        {open ? (
          <NewTemplateForm
            templates={templates}
            writer={writer}
            onMade={(made) => {
              onMade(made)
              setOpen(false)
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function NewTemplateForm({
  templates,
  writer,
  onMade,
}: {
  templates: TemplateItem[]
  writer: WriterId | null
  onMade: (template: TemplateItem) => void
}) {
  const { projectId } = useEditorRuntime()
  const [name, setName] = React.useState("")
  const [start, setStart] = React.useState<StartFrom>("blank")
  const [describe, setDescribe] = React.useState("")
  const [videoId, setVideoId] = React.useState("")
  const [savedVideoId, setSavedVideoId] = React.useState("")
  const [videos, setVideos] = React.useState<{ id: string; name: string }[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const nameRef = React.useRef<HTMLInputElement>(null)
  const references = templates.flatMap((one) =>
    one.references.filter((ref) => ref.kind !== "picture" && ref.state === "ready" && ref.savedVideoId)
  )
  const cents = start === "blank" || !writer ? null : writerCostCents(writer, 1_800 + describe.length, 900)

  React.useEffect(() => {
    if (start !== "video") return
    let active = true
    listVideos({ projectId })
      .then((loaded) => {
        if (active) setVideos(loaded.videos.map((video) => ({ id: video.id, name: video.name })))
      })
      .catch(() => {
        if (active) setVideos([])
      })
    return () => {
      active = false
    }
  }, [start, projectId])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (start === "blank" && !name.trim()) {
      setNameInvalid(true)
      showErrorToast("Give the template a name.")
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const made =
        start === "blank"
          ? await createTemplate({ start, name })
          : start === "ai"
            ? await createTemplate({ start, name, describe })
            : start === "video"
              ? await createTemplate({ start, name, videoId })
              : await createTemplate({ start, name, savedVideoId })
      onMade(made)
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor="new-template-name">Name</Label>
        <Input
          ref={nameRef}
          id="new-template-name"
          autoFocus
          value={name}
          maxLength={TEMPLATE_NAME_MAX}
          placeholder={start === "blank" ? "Work with me" : "Left empty, the AI names it"}
          aria-invalid={nameInvalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setNameInvalid(false)
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-template-start">Start from</Label>
        <Select value={start} onValueChange={(next) => setStart(next as StartFrom)}>
          <SelectTrigger id="new-template-start" className={NARROW_FIELD}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blank">Blank</SelectItem>
            <SelectItem value="ai">Write it with AI</SelectItem>
            <SelectItem value="video">From a video in this project</SelectItem>
            <SelectItem value="reference">From a reference video</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {start === "ai" ? (
        <div className="grid gap-2">
          <Label htmlFor="new-template-describe">What it is for, in a sentence</Label>
          <Textarea
            id="new-template-describe"
            rows={2}
            maxLength={TEMPLATE_DESCRIBE_MAX}
            value={describe}
            placeholder="Me working at a café, calm, 45 seconds"
            onChange={(event) => setDescribe(event.target.value)}
          />
          <LengthCounter length={describe.length} max={TEMPLATE_DESCRIBE_MAX} />
        </div>
      ) : null}
      {start === "video" ? (
        <div className="grid gap-2">
          <Label htmlFor="new-template-video">Video</Label>
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger id="new-template-video" className={NARROW_FIELD}>
              <SelectValue placeholder={videos === null ? "Fetching…" : "Pick one"} />
            </SelectTrigger>
            <SelectContent>
              {videos?.map((video) => (
                <SelectItem key={video.id} value={video.id}>
                  {video.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">The AI reads what it says, how long it runs and its clips.</p>
        </div>
      ) : null}
      {start === "reference" ? (
        <div className="grid gap-2">
          <Label htmlFor="new-template-reference">Reference</Label>
          <Select value={savedVideoId} onValueChange={setSavedVideoId}>
            <SelectTrigger id="new-template-reference" className={NARROW_FIELD}>
              <SelectValue placeholder={references.length ? "Pick one" : "No reference is broken down yet"} />
            </SelectTrigger>
            <SelectContent>
              {references.map((ref) => (
                <SelectItem key={ref.id} value={ref.savedVideoId as string}>
                  {ref.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            A video, Viral original or link added to a template, once it says Ready.
          </p>
        </div>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : start === "blank" ? null : <SparklesIcon />}
        {withEstimate("Create template", cents)}
      </Button>
      {start !== "blank" && !writer ? (
        <p className="text-xs text-muted-foreground">Writing it needs a Gemini, OpenAI or Anthropic key in Settings → AI.</p>
      ) : null}
    </form>
  )
}
