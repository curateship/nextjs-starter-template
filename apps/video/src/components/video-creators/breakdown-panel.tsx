import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  formatTimecode,
  segmentRoleLabels,
  type ViralBreakdown,
} from "@/lib/video/viral-breakdown"

/**
 * What Gemini made of a saved video: its parts, its cuts and every word in it.
 *
 * Built once and mounted twice — here in the research dashboard's right panel,
 * and in the Viral page's detail window. Clicking any line jumps the player to
 * that moment, which is the whole point of reading it beside the video rather
 * than under it.
 */

export function BreakdownPanel({
  breakdown,
  onSeek,
  atMs,
}: {
  breakdown: ViralBreakdown
  /** Jumps the player. Left out when there is no player to jump. */
  onSeek?: (ms: number) => void
  /** Where the player is now, so the line being played is marked. */
  atMs?: number
}) {
  const sections = [
    breakdown.segments.length > 0 && (
      <Section key="parts" title="How it is built">
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
                  {formatTimecode(segment.startMs)} –{" "}
                  {formatTimecode(segment.endMs)}
                </span>
              </span>
              <span className="text-sm">{segment.summary}</span>
            </span>
          </TimeRow>
        ))}
      </Section>
    ),
    breakdown.scenes.length > 0 && (
      <Section key="scenes" title={`Cuts (${breakdown.scenes.length})`}>
        <div className="flex flex-wrap gap-1.5 px-3 py-2">
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
      </Section>
    ),
    breakdown.transcript.length > 0 && (
      <Section key="transcript" title="Every word">
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
      </Section>
    ),
  ].filter(Boolean)

  if (sections.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        The breakdown came back empty. Try again to have another go at it.
      </p>
    )
  }

  return <div className="flex flex-col">{sections}</div>
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b last:border-b-0">
      <h3 className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
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
