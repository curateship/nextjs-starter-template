import { CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RenderJobSummary } from "@/lib/api/video/exports"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  chapterLines,
  chapterProblems,
  chapterText,
  chapterTime,
} from "@/lib/video/youtube-chapters"

/**
 * The export's named markers as YouTube chapter lines, with a Copy button
 * (youtube-chapters.md). They are the markers the render drew, so editing the
 * timeline afterwards never changes an export's chapters.
 */
export function ExportChaptersCard({ item }: { item: RenderJobSummary }) {
  const lines = item.markers ? chapterLines(item.markers) : []
  const problems = chapterProblems(lines, item.duration_ms ?? 0)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(chapterText(lines))
    } catch {
      showErrorToast("The chapters could not be copied. Select the lines and copy them yourself.")
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Chapters</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!item.markers ? (
          <p className="text-sm text-muted-foreground">
            This export was made before chapters existed. Export the video again to get them.
          </p>
        ) : !lines.length ? (
          <p className="text-sm text-muted-foreground">
            No named markers in this export. Press M on the timeline to drop a marker, double-click
            it to name it, then export again.
          </p>
        ) : (
          <>
            <ul className="grid gap-1 text-sm" data-export-chapters>
              {lines.map((line) => (
                <li key={`${line.atMs}-${line.name}`} className="flex gap-3">
                  <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                    {chapterTime(line.atMs)}
                  </span>
                  <span className="min-w-0 break-words">{line.name}</span>
                </li>
              ))}
            </ul>
            {problems.length ? (
              <ul className="grid gap-1 text-sm text-muted-foreground" data-chapter-problems>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
            <div>
              <Button type="button" variant="outline" onClick={() => void handleCopy()}>
                <CopyIcon />
                Copy chapters
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
