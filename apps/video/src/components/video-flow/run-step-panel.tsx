import * as React from "react"
import {
  AudioLinesIcon,
  CheckIcon,
  FileTextIcon,
  InfoIcon,
  LightbulbIcon,
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon,
  UploadIcon,
  WorkflowIcon,
} from "lucide-react"

import { RecordFrame } from "@/components/crm/record-frame"
import { SelectTileOverlay } from "@/components/video-editor/studio-media-collections"
import { DashboardTabs, useDashboardTabStyle } from "@/components/shared/dashboard-tabs"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { listActors } from "@/lib/api/video/actors"
import { loadVoices } from "@/lib/api/video/ai-tools"
import {
  approveFlowStep,
  getFlowErrorMessage,
  listFlowMedia,
  redoFlowStep,
  retryFlowStep,
  startFlowStep,
  type FlowRunDetail,
} from "@/lib/api/video/flow"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { queueUpload } from "@/lib/media/upload-queue"
import { cn } from "@/lib/utils"
import { formatAiEstimate } from "@/lib/video/ai-estimates"
import type { FlowFile, FlowRunStep } from "@/lib/video/flow/flows"
import { waitsOn } from "@/lib/video/flow/guide"
import { FLOW_BOX_INFO, FLOW_KIND_INFO, flowKindOf, type FlowBox } from "@/lib/video/flow/node-kinds"
import type { FlowStepInput } from "@/lib/video/flow/run-shape"
import { MADE_DRAFT } from "@/lib/video/flow/run-view"
import { formatCents } from "@/lib/video/project-spend"

const HIDE_LABEL = "Hide the step"

type Props = {
  run: FlowRunDetail
  step: FlowRunStep
  /** Where the step is in the guide, from 0, and how many steps it has. */
  index: number
  count: number
  /** What is in each of the step's boxes so far, shared with the middle's preview. */
  draftFor: (step: FlowRunStep, boxId: string) => FlowStepInput
  onDraft: (step: FlowRunStep, boxId: string, input: FlowStepInput) => void
  /** The run as the server has it after a change; `moveOn` opens the next step. */
  onRun: (run: FlowRunDetail, moveOn: boolean) => void
}

/**
 * The run's right panel: the step showing in the guide, as Tyler's picture
 * draws it (14 Nov 2026).
 *
 * - **Header:** the step's icon and title, then "Step 1 of 4 · Enter the
 *   details", the line saying what the step wants now.
 * - **Body:** the shell's folding cards (Tyler, 14 Nov 2026: "the run page
 *   right panel needs collapsible cards ui"): "This step" with what it waits
 *   on or what went wrong, then once made, what it made, editable while it
 *   waits for an OK; then a card for each box its node asks for (the
 *   Transcript, the Raw video), named after the box; then the Tip.
 * - **Footer:** the step's one button, "Generate script" (Tyler, pointing at
 *   it: "look at the fucking footer"). It sends what is in the boxes and has
 *   the AI make the step (he picked "At each step's button"); the guide moves
 *   on once it is made.
 */
export function RunStepPanel({ run, step, index, count, draftFor, onDraft, onRun }: Props) {
  const kind = flowKindOf(step.kind)
  const Icon = kind ? FLOW_KIND_INFO[kind].icon : WorkflowIcon
  const [act, busy] = useAsyncAction(getFlowErrorMessage)
  const stopped = run.status === "stopped"
  const doing = (work: () => Promise<FlowRunDetail>, moveOn = false) =>
    void act(async () => {
      onRun(await work(), moveOn)
    })
  const blockers = waitsOn(step, run.steps)
  const price = step.costCents ? `Cost ${formatCents(step.costCents)}` : step.estimateCents !== null ? `About ${formatAiEstimate(step.estimateCents)}` : null
  const open = step.status === "waiting" || step.status === "needs_input"

  /**
   * The boxes, each in a folding card named after it: to fill in while the
   * step is open, and what it held once it was made.
   */
  const boxes = step.boxes.map((box) => {
    const BoxIcon = FLOW_BOX_INFO[box.kind].icon
    return (
      <PanelCard key={box.id} storageId={`video-flow-run-box-${box.kind}`} icon={<BoxIcon />} title={box.label}>
        {open ? (
          <BoxField box={box} value={draftFor(step, box.id)} onChange={(value) => onDraft(step, box.id, value)} busy={busy} />
        ) : (
          <p className="line-clamp-3 text-sm text-muted-foreground">{boxSummary(box, step.input?.[box.id])}</p>
        )}
      </PanelCard>
    )
  })
  /** The step's state in words, in a card of its own. */
  const statusCard = (words: React.ReactNode, tone: "muted" | "plain" | "error" = "muted") => (
    <PanelCard storageId="video-flow-run-status" icon={<InfoIcon />} title="This step">
      <p className={cn("text-sm", tone === "muted" && "text-muted-foreground", tone === "error" && "text-destructive")}>{words}</p>
    </PanelCard>
  )

  let state = "Waiting"
  let body: React.ReactNode = null
  let footer: React.ReactNode = null

  if (!kind) {
    state = "From an older Flow"
    body = statusCard("This step is from an older version of Flow and can't be made. Start a new run.")
  } else if (open) {
    state = blockers.length ? "Waiting" : step.boxes.length ? "Enter the details" : "Ready to make"
    body = (
      <>
        {blockers.length
          ? statusCard(
              `This step opens once ${blockers.map((one) => one.title).join(" and ")} ${blockers.length > 1 ? "are" : "is"} done.`
            )
          : !step.boxes.length
            ? statusCard(`Everything it reads is ready${price ? `. ${price}` : ""}.`)
            : null}
        {boxes}
      </>
    )
    if (!blockers.length) {
      const inputs = Object.fromEntries(step.boxes.map((box) => [box.id, draftFor(step, box.id)]))
      footer = (
        <FooterButton busy={busy} icon={<SparklesIcon />} onClick={() => doing(() => startFlowStep(step.id, inputs))}>
          {step.button}
        </FooterButton>
      )
    }
  } else if (step.status === "queued" || step.status === "working") {
    state = step.status === "queued" ? "Up next" : "Being made"
    body = (
      <>
        {statusCard(step.note ?? "Being made now. This page looks again every few seconds, and the bell rings if you leave.")}
        {boxes}
      </>
    )
    footer = (
      <FooterButton busy icon={<SparklesIcon />} onClick={() => undefined}>
        Being made…
      </FooterButton>
    )
  } else if (step.status === "needs_ok") {
    state = "Check it"
    const original = step.output?.text ?? ""
    const edited = draftFor(step, MADE_DRAFT).text ?? original
    const changed = step.output?.text !== undefined && edited.trim() !== original.trim()
    body =
      step.output?.text !== undefined ? (
        <>
          <PanelCard storageId="video-flow-run-made" icon={<FileTextIcon />} title={step.heading || "What it made"}>
            <div className="grid gap-2">
              <label htmlFor={`flow-step-made-${step.id}`} className="sr-only">
                {step.heading || "What it made"}
              </label>
              <Textarea
                id={`flow-step-made-${step.id}`}
                rows={12}
                value={edited}
                onChange={(event) => onDraft(step, MADE_DRAFT, { text: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">What you change here is what the next steps are sent.</p>
            </div>
          </PanelCard>
          {boxes}
        </>
      ) : (
        <>
          {statusCard(step.output?.summary ?? "Made.", "plain")}
          {boxes}
        </>
      )
    footer = (
      <div className="grid w-full gap-2 @[15rem]:grid-cols-2">
        <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => doing(() => redoFlowStep(step.id))}>
          <RefreshCwIcon />
          Make it again
        </Button>
        <Button type="button" size="lg" disabled={busy} onClick={() => doing(() => approveFlowStep(step.id, changed ? edited : undefined), true)}>
          {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {changed ? "Save and OK" : "OK"}
        </Button>
      </div>
    )
  } else if (step.status === "failed") {
    state = "Failed"
    body = (
      <>
        {statusCard(step.error ?? "This step failed.", "error")}
        {boxes}
      </>
    )
    footer = (
      <FooterButton busy={busy} icon={<RotateCcwIcon />} onClick={() => doing(() => retryFlowStep(step.id))}>
        Try again
      </FooterButton>
    )
  } else if (step.status === "done") {
    state = "Done"
    body = (
      <>
        {statusCard(step.output?.summary ?? "Done.", "plain")}
        {boxes}
      </>
    )
    footer = (
      <FooterButton busy={busy} variant="outline" icon={<RefreshCwIcon />} onClick={() => doing(() => redoFlowStep(step.id))}>
        Make it again
      </FooterButton>
    )
  }

  return (
    <RecordFrame
      avatar={<Icon aria-hidden />}
      title={step.title}
      line={`Step ${index + 1} of ${count} · ${state}`}
      hideLabel={HIDE_LABEL}
      body={
        <>
          {stopped ? statusCard("The run was stopped, so nothing more happens in it.") : null}
          {body}
          {step.tip ? (
            <PanelCard storageId="video-flow-run-tip" icon={<LightbulbIcon />} title="Tip">
              <p className="text-sm leading-relaxed">{step.tip}</p>
            </PanelCard>
          ) : null}
        </>
      }
      footer={stopped || !kind ? null : footer}
    />
  )
}

/** One line saying what a made step's box held. */
function boxSummary(box: FlowBox, held: FlowStepInput | undefined) {
  if (!held) return "Nothing"
  if (held.text) {
    const words = held.text.trim().split(/\s+/).filter(Boolean).length
    return words === 1 ? "1 word" : `${words} words`
  }
  if (held.link) return held.link
  if (held.mediaIds?.length) return held.mediaIds.length === 1 ? "1 file" : `${held.mediaIds.length} files`
  if (held.actorId || held.voiceId) return box.kind === "actor-voice" ? "Picked" : "Given"
  return "Nothing"
}

/** The footer's one button, the panel's full width and 36px tall as a footer's are. */
function FooterButton({
  busy,
  icon,
  variant = "default",
  onClick,
  children,
}: {
  busy: boolean
  icon: React.ReactNode
  variant?: "default" | "outline"
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" size="lg" variant={variant} className="w-full" disabled={busy} onClick={onClick}>
      {busy ? <Loader2Icon className="animate-spin" /> : icon}
      {children}
    </Button>
  )
}

/** One box of the step, bound to its draft so the middle shows it as it is filled in. */
function BoxField({
  box,
  value,
  onChange,
  busy,
}: {
  box: FlowBox
  value: FlowStepInput
  onChange: (value: FlowStepInput) => void
  busy: boolean
}) {
  const id = `flow-box-${box.id}`
  if (box.kind === "text") {
    return (
      <div className="grid gap-2">
        <FieldLabel htmlFor={id} className="sr-only">
          {box.label}
        </FieldLabel>
        <Textarea id={id} rows={12} value={value.text ?? ""} disabled={busy} onChange={(event) => onChange({ text: event.target.value })} />
      </div>
    )
  }
  if (box.kind === "link") {
    return (
      <div className="grid gap-2">
        <FieldLabel htmlFor={id} className="sr-only">
          {box.label}
        </FieldLabel>
        <Input
          id={id}
          inputMode="url"
          placeholder="https://www.youtube.com/shorts/…"
          value={value.link ?? ""}
          disabled={busy}
          onChange={(event) => onChange({ link: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">A YouTube, TikTok or Instagram video. It is downloaded into Media when the step is made.</p>
      </div>
    )
  }
  if (box.kind === "video") return <UploadBox box={box} value={value} busy={busy} onChange={onChange} />
  if (box.kind === "media") return <PickMediaField label={box.label} picked={value.mediaIds ?? []} onChange={(mediaIds) => onChange({ mediaIds })} />
  return <PickActorVoiceField label={box.label} value={value} onChange={onChange} />
}

/** One video, sent through the app's upload line; the box keeps the uploaded file. */
function UploadBox({
  box,
  value,
  busy,
  onChange,
}: {
  box: FlowBox
  value: FlowStepInput
  busy: boolean
  onChange: (value: FlowStepInput) => void
}) {
  const fileInput = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState<string | null>(null)
  const [uploaded, setUploaded] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const has = Boolean(value.mediaIds?.length)
  return (
    <div className="grid gap-2 text-sm">
      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        className="sr-only"
        aria-label={box.label}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          setError(null)
          setUploading(file.name)
          queueUpload(file)
            .then((media) => {
              setUploaded(file.name)
              onChange({ mediaIds: [media.id] })
            })
            .catch((uploadError: unknown) =>
              setError(uploadError instanceof Error ? uploadError.message : "The upload stopped. Try again.")
            )
            .finally(() => setUploading(null))
        }}
      />
      <Button type="button" variant="outline" disabled={busy || uploading !== null} onClick={() => fileInput.current?.click()}>
        {uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
        {uploading ? `Uploading ${uploading}` : has ? "Upload another video" : "Upload a video"}
      </Button>
      {has ? <p className="text-muted-foreground">{uploaded ?? "A video"} is uploaded.</p> : null}
      <p className="text-muted-foreground">
        It goes on the project's Media shelf when the run is saved. A big video keeps going in the upload line at the
        bottom right if you move to another page.
      </p>
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  )
}

type MediaKind = FlowFile["fileType"]
type MediaShelf = { files: FlowFile[]; total: number; page: number }

const MEDIA_TABS: { kind: MediaKind; label: string }[] = [
  { kind: "video", label: "Videos" },
  { kind: "image", label: "Pictures" },
  { kind: "audio", label: "Sounds" },
]

/** How many files a tab shows at first, and how many more each Load more adds (Tyler, 14 Nov 2026: "add a cap of 15 items and a load more button"). */
const MEDIA_PAGE = 15

function readShelf(kind: MediaKind, search: string, page: number): Promise<MediaShelf> {
  return listFlowMedia({ page, pageSize: MEDIA_PAGE, fileType: kind, search: search.trim() || undefined }).then((read) => ({
    ...read,
    page,
  }))
}

/**
 * Files already in Media, ticked one or more at a time, under tabs for
 * Videos, Pictures and Sounds, each with how many it has (Tyler, 14 Nov 2026:
 * "the files card should be seperated by tabs"). A tab shows 15 files, and
 * Load more adds 15 more. The tabs are the shell's dashboard tabs, drawn as
 * Settings → Styling says. The search covers every tab, and a tick stays
 * when another tab is opened.
 */
function PickMediaField({ label, picked, onChange }: { label: string; picked: string[]; onChange: (ids: string[]) => void }) {
  const [shelves, setShelves] = React.useState<Record<MediaKind, MediaShelf> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [tab, setTab] = React.useState<MediaKind>("video")
  const [loadingMore, setLoadingMore] = React.useState(false)
  const tabStyle = useDashboardTabStyle()
  React.useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      Promise.all(MEDIA_TABS.map(({ kind }) => readShelf(kind, search, 1).then((shelf): [MediaKind, MediaShelf] => [kind, shelf])))
        .then((read) => {
          if (live) setShelves(Object.fromEntries(read) as Record<MediaKind, MediaShelf>)
        })
        .catch((readError: unknown) => {
          if (live) setError(readError instanceof Error ? readError.message : "Media couldn't be read.")
        })
    }, 250)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [search])
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((one) => one !== id) : [...picked, id])
  const shelf = shelves?.[tab]
  const loadMore = () => {
    if (!shelf || loadingMore) return
    setLoadingMore(true)
    const kind = tab
    readShelf(kind, search, shelf.page + 1)
      .then((next) =>
        setShelves((current) =>
          current ? { ...current, [kind]: { ...next, files: [...current[kind].files, ...next.files] } } : current
        )
      )
      .catch((readError: unknown) => setError(readError instanceof Error ? readError.message : "Media couldn't be read."))
      .finally(() => setLoadingMore(false))
  }
  const tabs = (
    <DashboardTabs
      value={tab}
      onValueChange={(value) => setTab(value as MediaKind)}
      tabs={MEDIA_TABS.map(({ kind, label: name }) => ({ value: kind, label: name, count: shelves?.[kind].total }))}
    />
  )
  return (
    <div className="grid min-w-0 gap-3">
      {/* Underline tabs reach up and down 12px to sit on a header's bottom
          line, so in a card they get a row shaped as a panel header: as tall
          as one, straight under the card's heading, its full width (the
          card's sides are 16px), with the line on its bottom edge. */}
      {tabStyle === "underline" ? (
        <div className="-mx-4 mt-[calc(var(--shell-panel-card-tile-top,0px)*-1)] flex min-h-[var(--dashboard-card-header-height)] min-w-0 items-center border-b px-4 py-3">
          {tabs}
        </div>
      ) : (
        tabs
      )}
      <FieldLabel htmlFor={`flow-media-search-${label}`} className="sr-only">
        Search Media for {label}
      </FieldLabel>
      <Input id={`flow-media-search-${label}`} placeholder="Search Media" value={search} onChange={(event) => setSearch(event.target.value)} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!shelves && !error ? <LoadingRow label="Reading Media…" /> : null}
      {shelf && !shelf.files.length ? <p className="text-sm text-muted-foreground">Nothing here{search.trim() ? " matches" : " yet"}.</p> : null}
      {/* Laid out as the editor's Media panel (Tyler, 14 Nov 2026: "load it in
          masonary style"): pictures and videos in two columns, each tile its
          own shape; sounds in an even two-column grid. */}
      <div className={tab === "audio" ? "grid grid-cols-2 gap-3" : "columns-2 gap-3"}>
        {(shelf?.files ?? []).map((file) => (
          <MediaTile key={file.id} file={file} picked={picked.includes(file.id)} onToggle={() => toggle(file.id)} />
        ))}
      </div>
      {shelf && shelf.files.length < shelf.total ? (
        <Button type="button" variant="outline" onClick={loadMore}>
          {loadingMore ? <Loader2Icon className="animate-spin" /> : null}
          Load more
        </Button>
      ) : null}
      {picked.length ? <p className="text-xs text-muted-foreground">{picked.length === 1 ? "1 file picked" : `${picked.length} files picked`}</p> : null}
    </div>
  )
}

/**
 * One file in the Files list, as a tile of the editor's Media panel: a
 * picture itself, a video's first frame read from its smooth copy (only the
 * start of it, never the whole file), a sound as a small card with its
 * name. The editor's tick sits in its corner and a ring shows it is picked.
 */
function MediaTile({ file, picked, onToggle }: { file: FlowFile; picked: boolean; onToggle: () => void }) {
  return (
    <div className="relative mb-3 break-inside-avoid overflow-hidden rounded-xl border bg-card" title={file.name}>
      {file.fileType === "image" ? (
        <img src={file.url} alt="" loading="lazy" draggable={false} className="block w-full" />
      ) : file.fileType === "video" ? (
        <video src={file.url} muted playsInline preload="metadata" className="block w-full" />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-start justify-end gap-1.5 p-2.5">
          <AudioLinesIcon aria-hidden className="size-5 text-muted-foreground" />
          <span className="line-clamp-2 text-xs break-all">{file.name}</span>
        </div>
      )}
      <SelectTileOverlay name={file.name} selected={picked} onToggle={onToggle} />
    </div>
  )
}

const NONE = "none"

/** One of your actors, one voice, or both. */
function PickActorVoiceField({ label, value, onChange }: { label: string; value: FlowStepInput; onChange: (input: FlowStepInput) => void }) {
  const [actors, setActors] = React.useState<{ id: string; name: string }[] | null>(null)
  const [voices, setVoices] = React.useState<{ id: string; name: string }[] | null>(null)
  const [voiceError, setVoiceError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    listActors()
      .then((read) => {
        if (live) setActors(read.actors.map((actor) => ({ id: actor.id, name: actor.name })))
      })
      .catch(() => {
        if (live) setActors([])
      })
    loadVoices()
      .then((read) => {
        if (live) setVoices(read.map((voice) => ({ id: voice.id, name: voice.name })))
      })
      .catch((error: unknown) => {
        if (!live) return
        setVoices([])
        setVoiceError(error instanceof Error ? error.message : "The voices couldn't be read.")
      })
    return () => {
      live = false
    }
  }, [])
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <FieldLabel htmlFor={`flow-actor-${label}`}>Actor</FieldLabel>
        <Select value={value.actorId ?? NONE} onValueChange={(next) => onChange({ ...value, actorId: next === NONE ? undefined : next })}>
          <SelectTrigger id={`flow-actor-${label}`} className="w-full">
            <SelectValue placeholder={actors ? "No actor" : "Reading your actors…"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No actor</SelectItem>
            {(actors ?? []).map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={`flow-voice-${label}`}>Voice</FieldLabel>
        <Select value={value.voiceId ?? NONE} onValueChange={(next) => onChange({ ...value, voiceId: next === NONE ? undefined : next })}>
          <SelectTrigger id={`flow-voice-${label}`} className="w-full">
            <SelectValue placeholder={voices ? "No voice" : "Reading the voices…"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No voice</SelectItem>
            {(voices ?? []).map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {voice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {voiceError ? <p className="text-xs text-destructive">{voiceError}</p> : null}
      </div>
    </div>
  )
}
