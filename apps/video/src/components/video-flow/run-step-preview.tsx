import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ClapperboardIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getFlowErrorMessage, getFlowFiles, type FlowRunDetail } from "@/lib/api/video/flow"
import { cn } from "@/lib/utils"
import type { FlowFile, FlowRunStep } from "@/lib/video/flow/flows"
import { FLOW_BOX_INFO, FLOW_KIND_INFO, flowKindOf } from "@/lib/video/flow/node-kinds"
import type { FlowStepInput } from "@/lib/video/flow/run-shape"
import { GUIDE_BLUE, MADE_DRAFT } from "@/lib/video/flow/run-view"

/** "[00:14] Maya: So we stopped…" or "00:14 Maya: …": a time, an optional speaker, the words. */
const TIMED_LINE = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?:([^:\n]{1,40}):\s+)?(.*)$/

type ReadLine = { time: string | null; speaker: string | null; text: string }

/** Text split into its lines, each read for a time and a speaker when it has them. */
function readLines(text: string): ReadLine[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const timed = TIMED_LINE.exec(line)
      return timed ? { time: timed[1], speaker: timed[2]?.trim() || null, text: timed[3] } : { time: null, speaker: null, text: line }
    })
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * The middle's card for one step, in the grey frame of Tyler's picture: a
 * heading row with the step's icon, the name of what it holds and its size,
 * then what it holds.
 *
 * - **Words** (a paste, a script the AI wrote, what a link says) are read
 *   line by line. A line starting with a time, and a speaker before a colon,
 *   shows the time, the speaker and the words in three columns, as a
 *   transcript does.
 * - **Files, a pick, the video** show what they are, and the video a button
 *   that opens it.
 * - **An AI step not made yet** shows what the AI will be asked.
 */
export function StepPreview({
  run,
  step,
  draftFor,
}: {
  run: FlowRunDetail
  step: FlowRunStep
  draftFor: (step: FlowRunStep, boxId: string) => FlowStepInput
}) {
  const kind = flowKindOf(step.kind)
  const Icon = kind ? FLOW_KIND_INFO[kind].icon : ClapperboardIcon
  const made = step.output
  const open = step.status === "waiting" || step.status === "needs_input"

  // Before the AI makes it, the card shows what it will read: the first box
  // of words on the right (the transcript), as it is typed.
  const textBox = step.boxes.find((box) => box.kind === "text" || box.kind === "link")
  const boxText = textBox ? (open ? draftFor(step, textBox.id).text : step.input?.[textBox.id]?.text) : undefined
  const madeText = step.status === "needs_ok" ? (draftFor(step, MADE_DRAFT).text ?? made?.text) : made?.text

  let label = step.title
  let LabelIcon = Icon
  let meta: string | null = null
  let body: React.ReactNode

  const linesView = (text: string) => {
    const lines = readLines(text)
    meta = `${lines.length === 1 ? "1 line" : `${lines.length} lines`} · ${countWords(text)} words`
    return (
      <ol className="grid">
        {lines.map((line, at) => (
          <li key={at} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 border-b py-3 last:border-b-0">
            {line.time ? <span className="pt-0.5 font-mono text-sm text-muted-foreground tabular-nums">{line.time}</span> : <span />}
            <span className="grid gap-0.5">
              {line.speaker ? <span className={cn("text-sm font-medium", GUIDE_BLUE)}>{line.speaker}</span> : null}
              <span className="text-base leading-relaxed">{line.text}</span>
            </span>
          </li>
        ))}
      </ol>
    )
  }

  if (step.status === "failed") {
    label = "Why it stopped"
    body = <p className="text-sm text-destructive">{step.error ?? "This step failed."}</p>
  } else if (!made && textBox && boxText?.trim()) {
    label = textBox.label
    LabelIcon = FLOW_BOX_INFO[textBox.kind].icon
    body = linesView(boxText)
  } else if (!made && step.boxes.length) {
    label = "What it reads"
    body = (
      <ul className="grid">
        {step.boxes.map((box) => {
          const held = open ? draftFor(step, box.id) : step.input?.[box.id]
          return (
            <li key={box.id} className="grid gap-2 border-b py-3 text-sm last:border-b-0">
              <span className="font-medium">{box.label}</span>
              <BoxHeld held={held} />
            </li>
          )
        })}
      </ul>
    )
  } else if (!made) {
    label = step.status === "queued" || step.status === "working" ? "Being made" : "What the AI is asked"
    body = (
      <div className="grid gap-3 text-sm">
        {step.note ? <p className="text-muted-foreground">{step.note}</p> : null}
        <p className="leading-relaxed whitespace-pre-wrap">{step.prompt}</p>
        {step.feedsFrom.length ? <p className="text-muted-foreground">It also reads what {step.feedsFrom.join(" and ")} made.</p> : null}
      </div>
    )
  } else if (madeText?.trim()) {
    label = "What it made"
    body = linesView(madeText)
  } else if (made?.summary || made?.videoId) {
    label = "What it made"
    body = (
      <div className="grid gap-3 text-sm">
        {made.summary ? <p>{made.summary}</p> : null}
        {made.videoId && run.projectId ? (
          <Button asChild variant="outline" className="w-fit">
            <Link to="/admin/video-editor/$projectId" params={{ projectId: run.projectId }} search={{ video: made.videoId }}>
              <ClapperboardIcon />
              Open the video
            </Link>
          </Button>
        ) : null}
        {made.thumbnailIds?.length ? <p className="text-muted-foreground">The thumbnail is on the video's Thumbnail board.</p> : null}
      </div>
    )
  } else {
    body = <p className="text-sm text-muted-foreground">Nothing here yet.</p>
  }

  return (
    <div className="rounded-2xl bg-muted/60 p-6 @4xl:p-8">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <LabelIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-base font-medium">{label}</span>
          {meta ? <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{meta}</span> : null}
        </div>
        <ScrollArea className={cn("max-h-[26rem]", "[&>[data-radix-scroll-area-viewport]]:max-h-[26rem]")}>
          <div className="px-6 py-3">{body}</div>
        </ScrollArea>
      </div>
    </div>
  )
}

/**
 * What one box holds, shown as itself rather than "Filled in" (Tyler, 14 Nov
 * 2026: "actually show the video thumbnail and playable"): its words, its
 * link, its files as tiles that play where they are, or that an actor or
 * voice was picked.
 */
function BoxHeld({ held }: { held: FlowStepInput | undefined }) {
  if (held?.mediaIds?.length) return <FlowFiles mediaIds={held.mediaIds} />
  if (held?.text?.trim()) return <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{held.text.trim()}</p>
  if (held?.link) return <p className="truncate text-muted-foreground">{held.link}</p>
  if (held?.actorId || held?.voiceId) {
    return <p className="text-muted-foreground">{held.actorId && held.voiceId ? "An actor and a voice picked" : held.actorId ? "An actor picked" : "A voice picked"}</p>
  }
  return <p className="text-muted-foreground">Not filled in yet. Fill it in on the right.</p>
}

/**
 * Files as tiles two to a row, 16:9 with their name under: a video plays in
 * place with its own controls, its first frame its thumbnail, from the same
 * smooth copy the editor plays; a picture shows; a sound has a player. Read from the server by id, so a reload
 * shows them too.
 */
function FlowFiles({ mediaIds }: { mediaIds: string[] }) {
  const key = mediaIds.join(",")
  const [read, setRead] = React.useState<{ key: string; files: FlowFile[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    getFlowFiles(key.split(","))
      .then((files) => {
        if (live) setRead({ key, files })
      })
      .catch((readError: unknown) => {
        if (live) setError(getFlowErrorMessage(readError))
      })
    return () => {
      live = false
    }
  }, [key])
  if (error) return <p className="text-destructive">{error}</p>
  if (!read || read.key !== key) return <LoadingRow label="Reading the files…" />
  if (!read.files.length) return <p className="text-muted-foreground">These files are no longer in your Media.</p>
  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        {read.files.map((file) => (
          <li key={file.id} className="grid min-w-0 gap-1.5">
            {file.fileType === "audio" ? (
              <audio controls preload="metadata" src={file.url} className="w-full" aria-label={file.name} />
            ) : (
              <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                {file.fileType === "video" ? (
                  // As the editor's tiles: only the start of the smooth copy is
                  // read, for its length and first frame; the rest streams
                  // when it is played.
                  <video controls preload="metadata" playsInline src={file.url} className="size-full object-contain" aria-label={file.name} />
                ) : (
                  <img src={file.url} alt={file.name} className="size-full object-contain" />
                )}
              </div>
            )}
            <span className="truncate text-xs text-muted-foreground">{file.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
