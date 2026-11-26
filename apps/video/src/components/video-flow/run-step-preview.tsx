import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ClapperboardIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getFlowErrorMessage, getFlowFiles, type FlowRunDetail } from "@/lib/api/video/flow"
import { FlowPicture, FlowVideo } from "@/components/video-flow/flow-media-viewer"
import type { PromptIdeas } from "@/components/video-flow/use-prompt-ideas"
import { cn } from "@/lib/utils"
import type { FlowFile, FlowRunStep } from "@/lib/video/flow/flows"
import { FLOW_BOX_INFO, FLOW_KIND_INFO, flowKindOf } from "@/lib/video/flow/node-kinds"
import type { FlowStepInput } from "@/lib/video/flow/run-shape"
import { fedFiles, GUIDE_BLUE, MADE_DRAFT } from "@/lib/video/flow/run-view"

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
 *   that opens it. A picture, sound or downloaded file the step made shows as
 *   its tile, not its file name.
 * - **An AI step not made yet** shows what it reads: this video's prompt as it
 *   is typed, what the steps before it made, its boxes, and how every video
 *   of the channel is built at this step.
 */
export function StepPreview({
  run,
  step,
  draftFor,
  ideas,
}: {
  run: FlowRunDetail
  step: FlowRunStep
  draftFor: (step: FlowRunStep, boxId: string) => FlowStepInput
  ideas: PromptIdeas
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

  // What the steps with a line into this one made as files (the café picture
  // on Make the study video): the AI is sent them, so the card shows them
  // (Tyler, 25 Nov 2026: "how come step 2 doesnt include the generated image?").
  const fed = fedFiles(run.steps, step)
  const fedRows = fed.map((from) => (
    <li key={from.id} className="grid gap-2 border-b py-3 text-sm last:border-b-0">
      <span className="font-medium">From {from.title}</span>
      <FlowFiles mediaIds={from.mediaIds} wide />
    </li>
  ))

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
  } else if (!made) {
    // This video's prompt as it is typed, what the steps before it made, its
    // boxes, then how every video of the channel is built at this step.
    label = step.status === "queued" || step.status === "working" ? "Being made" : "What it reads"
    const words = ideas.promptFor(step).trim()
    body = (
      <div className="grid gap-3 text-sm">
        {step.note ? <p className="text-muted-foreground">{step.note}</p> : null}
        <ul className="grid">
          <li className="grid gap-2 border-b py-3 last:border-b-0">
            <span className="font-medium">This video</span>
            {ideas.writing(step) ? (
              <LoadingRow label="Writing an idea…" />
            ) : words ? (
              <p className="text-base leading-relaxed whitespace-pre-wrap">{words}</p>
            ) : (
              <p className="text-muted-foreground">Nothing written for this video yet. The step follows the flow's prompt alone.</p>
            )}
          </li>
          {fedRows}
          {step.boxes.map((box) => {
            const held = open ? draftFor(step, box.id) : step.input?.[box.id]
            return (
              <li key={box.id} className="grid gap-2 border-b py-3 last:border-b-0">
                <span className="font-medium">{box.label}</span>
                <BoxHeld held={held} optional={!!box.optional} />
              </li>
            )
          })}
          <li className="grid gap-2 border-b py-3 last:border-b-0">
            <span className="font-medium">How every video is built</span>
            <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{step.prompt}</p>
            {step.feedsFrom.length > fed.length ? (
              <p className="text-muted-foreground">It also reads what {step.feedsFrom.join(" and ")} made.</p>
            ) : null}
          </li>
        </ul>
      </div>
    )
  } else if (madeText?.trim()) {
    label = "What it made"
    body = linesView(madeText)
  } else if (made?.summary || made?.videoId || made?.mediaIds?.length) {
    label = "What it made"
    body = (
      <div className="grid gap-3 text-sm">
        {made.mediaIds?.length ? <FlowFiles mediaIds={made.mediaIds} wide /> : made.summary ? <p>{made.summary}</p> : null}
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
function BoxHeld({ held, optional }: { held: FlowStepInput | undefined; optional: boolean }) {
  if (held?.mediaIds?.length) return <FlowFiles mediaIds={held.mediaIds} />
  if (held?.text?.trim()) return <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{held.text.trim()}</p>
  if (held?.link) return <p className="truncate text-muted-foreground">{held.link}</p>
  if (held?.actorId || held?.voiceId) {
    return <p className="text-muted-foreground">{held.actorId && held.voiceId ? "An actor and a voice picked" : held.actorId ? "An actor picked" : "A voice picked"}</p>
  }
  return (
    <p className="text-muted-foreground">
      {optional ? "Empty, which is allowed: the step goes on without it." : "Not filled in yet. Fill it in on the right."}
    </p>
  )
}

/**
 * Files as tiles two to a row, 16:9 with their name under: a video plays in
 * place with its own controls, its first frame its thumbnail, from the same
 * smooth copy the editor plays; a picture shows and opens full size when
 * pressed; a sound has a player. Read from the server by id, so a reload
 * shows them too. `wide` puts one to a row, a picture at its own shape
 * filling the width: how a step shows what it made.
 */
export function FlowFiles({ mediaIds, wide = false }: { mediaIds: string[]; wide?: boolean }) {
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
      <ul className={cn("grid grid-cols-1 gap-3", !wide && "@md:grid-cols-2")}>
        {read.files.map((file) => (
          <li key={file.id} className="grid min-w-0 gap-1.5">
            {file.fileType === "audio" ? (
              <audio controls preload="metadata" src={file.url} className="w-full" aria-label={file.name} />
            ) : file.fileType === "image" ? (
              <FlowPicture url={file.url} name={file.name} />
            ) : (
              <FlowVideo url={file.url} name={file.name} wide={wide} />
            )}
            <span className="truncate text-xs text-muted-foreground">{file.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
