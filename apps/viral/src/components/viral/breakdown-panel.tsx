import * as React from "react"

import { InspectorCard } from "@/components/shared/inspector-card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  formatTimecode,
  segmentRoleLabels,
  type ViralBreakdown,
} from "@/lib/viral/viral-breakdown"

/**
 * What Gemini made of a saved video: its parts, its cuts and every word in it.
 *
 * Built once and mounted twice: under the player on a Viral project, and in
 * the editor's Copy panel. Clicking any line jumps the player to
 * that moment, which is the whole point of reading it beside the video rather
 * than under it.
 */

export function BreakdownPanel({
  breakdown,
  onSeek,
  atMs,
  only,
}: {
  breakdown: ViralBreakdown
  /** Jumps the player. Left out when there is no player to jump. */
  onSeek?: (ms: number) => void
  /** Where the player is now, so the line being played is marked. */
  atMs?: number
  /**
   * Which cards: "words" is What is said alone, which sits right under the
   * player (Tyler, 4 Nov 2026: "the what is said card should be under
   * video"); "structure" is the rest. Left out, all of them.
   */
  only?: "words" | "structure"
}) {
  const parts = breakdown.segments.length
  const shots = breakdown.scenes.length
  const lines = breakdown.transcript.length
  // With no player to jump, nothing here is clickable, so nothing says so.
  const click = (sentence: string) => (onSeek ? ` ${sentence}` : "")
  const sections = [
    only !== "words" && parts > 0 && (
      <BreakdownSection
        key="parts"
        storageId="viral-breakdown-parts"
        title="How it is built"
        meta={parts}
        about={`The AI splits the video into the parts of its story, such as the hook.${click("Click one to play from there.")}`}
        rows
      >
        {breakdown.segments.map((segment, index) => (
          <TimeRow
            key={`${segment.startMs}-${index}`}
            startMs={segment.startMs}
            endMs={segment.endMs}
            atMs={atMs}
            onSeek={onSeek}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                <Badge variant="secondary">
                  {segmentRoleLabels[segment.role]}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatTimecode(segment.startMs)} to {formatTimecode(segment.endMs)}
                </span>
              </span>
              <span className="text-sm">{segment.summary}</span>
            </span>
          </TimeRow>
        ))}
      </BreakdownSection>
    ),
    only !== "words" && shots > 0 && (
      <BreakdownSection
        key="scenes"
        storageId="viral-breakdown-shots"
        title="Shots"
        meta={shots}
        about={
          shots === 1
            ? "The video is one shot: the picture never cuts away."
            : `Where each new shot starts, every time the picture cuts to something else.${click("Click a time to jump there.")}`
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {breakdown.scenes.map((scene, index) => (
            <button
              key={`${scene.startMs}-${index}`}
              type="button"
              disabled={!onSeek}
              onClick={() => onSeek?.(scene.startMs)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs tabular-nums",
                onSeek && "hover:bg-muted",
                isAt(atMs, scene) && "bg-muted",
                focusRing
              )}
            >
              {formatTimecode(scene.startMs)}
            </button>
          ))}
        </div>
      </BreakdownSection>
    ),
    only !== "structure" && lines > 0 && (
      <BreakdownSection
        key="transcript"
        storageId="viral-breakdown-words"
        title="What is said"
        meta={lines}
        about={`Every line spoken, and any words written on screen, with the time each starts.${click("Click one to play from there.")}`}
        rows
      >
        {breakdown.transcript.map((line, index) => (
          <TimeRow
            key={`${line.startMs}-${index}`}
            startMs={line.startMs}
            endMs={line.endMs}
            atMs={atMs}
            onSeek={onSeek}
          >
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatTimecode(line.startMs)}
            </span>
            <span className="min-w-0 flex-1 text-sm">{line.text}</span>
          </TimeRow>
        ))}
      </BreakdownSection>
    ),
  ].filter(Boolean)

  if (sections.length === 0) {
    // One half of a split breakdown with nothing in it shows nothing; the other half says so.
    if (only === "words" || (only === "structure" && lines > 0)) return null
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        The breakdown came back empty. Try again to have another go at it.
      </p>
    )
  }

  return <div className="grid grid-cols-[minmax(0,1fr)] gap-3">{sections}</div>
}

/**
 * One part of the breakdown as its own folding section, like the left
 * panel's: a heading with a count, then a line saying what the part is
 * (Tyler, 20 Oct 2026: "all these part need some seperation ... i dont know
 * what im looking at").
 */
function BreakdownSection({
  storageId,
  title,
  meta,
  about,
  rows = false,
  children,
}: {
  storageId: string
  title: string
  meta: number
  about: string
  /** Clickable rows, run to the panel's edges with a line between each. */
  rows?: boolean
  children: React.ReactNode
}) {
  return (
    // A card like the AI's (Tyler, 4 Nov 2026: "all these should be in cards"); rows run to its edges.
    <InspectorCard storageId={storageId} title={`${title} · ${meta}`} description={about}>
      {rows ? <div className="-mx-4 -mb-4 overflow-hidden rounded-b-lg border-t">{children}</div> : children}
    </InspectorCard>
  )
}

/**
 * One clickable moment. A button rather than a div so it is reachable by
 * keyboard, and the current line is marked by a background as well as being
 * where the player is — colour alone would say nothing to a screen reader.
 */
function TimeRow({
  startMs,
  endMs,
  atMs,
  onSeek,
  children,
}: {
  startMs: number
  endMs: number
  atMs?: number
  onSeek?: (ms: number) => void
  children: React.ReactNode
}) {
  const playing = isAt(atMs, { startMs, endMs })
  return (
    <button
      type="button"
      disabled={!onSeek}
      aria-current={playing ? "true" : undefined}
      onClick={() => onSeek?.(startMs)}
      className={cn(
        "flex w-full items-start gap-2 border-b px-3 py-2 text-left last:border-b-0",
        onSeek && "hover:bg-muted/50",
        playing && "bg-muted",
        focusRing
      )}
    >
      {children}
    </button>
  )
}

function isAt(
  atMs: number | undefined,
  range: { startMs: number; endMs: number }
): boolean {
  return atMs !== undefined && atMs >= range.startMs && atMs < range.endMs
}
