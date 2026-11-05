import * as React from "react"
import { HeartIcon } from "lucide-react"

import { InspectorCard } from "@/components/shared/inspector-card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadVideoCommentsFn, type ViralComments } from "@/lib/api/viral/viral-finding"
import { formatCount } from "@/lib/viral/creators"
import type { ViralVideo } from "@/lib/viral/viral"

type State = { state: "loading" } | { state: "failed"; error: string } | { state: "done"; answer: ViralComments }

/**
 * Top comments on the right panel (Tyler, 4 Nov 2026: "20 comments only").
 * A YouTube video's are read once when it opens, 1 unit, and kept for a day;
 * TikTok and Instagram say they can't share theirs (`workspace/docs/finding-content.md`).
 */
export function CommentsCard({ video, projectId }: { video: ViralVideo; projectId: string }) {
  const [result, setResult] = React.useState<State>({ state: "loading" })
  const [attempt, setAttempt] = React.useState(0)
  const { platform, platformVideoId } = video

  React.useEffect(() => {
    let live = true
    loadVideoCommentsFn({ projectId, platform, platformVideoId })
      .then((answer) => {
        if (live) setResult({ state: "done", answer })
      })
      .catch((error) => {
        if (live) setResult({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [attempt, platform, platformVideoId, projectId])

  return (
    <InspectorCard storageId="viral-video-comments" title="Top comments">
      {result.state === "loading" ? (
        <LoadingRow label="Reading the comments" />
      ) : result.state === "failed" ? (
        <ErrorRow
          message={result.error}
          onRetry={() => {
            setResult({ state: "loading" })
            setAttempt((count) => count + 1)
          }}
        />
      ) : result.answer.state === "unavailable" ? (
        <p className="text-sm text-muted-foreground">{result.answer.reason}</p>
      ) : result.answer.state === "disabled" ? (
        <p className="text-sm text-muted-foreground">Comments are switched off on this video.</p>
      ) : result.answer.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has commented yet.</p>
      ) : (
        <ol className="grid gap-3 text-sm">
          {result.answer.comments.map((comment, index) => (
            <li key={index} className="grid gap-0.5">
              <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{comment.author || "Someone"}</span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <HeartIcon className="size-3" aria-hidden />
                  {formatCount(comment.likes)}
                  <span className="sr-only">likes</span>
                </span>
              </span>
              <span className="break-words whitespace-pre-line">{comment.text}</span>
            </li>
          ))}
        </ol>
      )}
    </InspectorCard>
  )
}
