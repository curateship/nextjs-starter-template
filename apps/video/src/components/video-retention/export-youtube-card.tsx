import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ExternalLinkIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { RetentionChart } from "@/components/video-retention/retention-chart"
import type { RenderJobSummary } from "@/lib/api/video/exports"
import {
  getRetentionErrorMessage,
  loadExportRetention,
  postExportYoutubeLink,
  refreshExportYoutube,
  removeExportYoutubeLink,
  type ExportRetention,
} from "@/lib/api/video/youtube-retention"
import {
  channelChangedMessage,
  figuresMayLag,
  FIGURES_LAG_HOURS,
  readYoutubeVideoId,
  YOUTUBE_LINK_INVALID_MESSAGE,
  YOUTUBE_LINK_MAX,
} from "@/lib/video/retention"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Posted on YouTube" in the Export window (`workspace/docs/retention-curve.md`):
 * paste the video's link once, and the curve YouTube measured for it is drawn
 * over this export's scenes. Opening the window again reads what was kept;
 * only Refresh asks YouTube again.
 *
 * Admins only. For anybody else, a guest sent from Project included, the
 * server answers null and the card is left out, since the connected channel
 * is the site's.
 */
export function ExportYoutubeCard({ item }: { item: RenderJobSummary }) {
  const [state, setState] = React.useState<{
    retention: ExportRetention | null
    loaded: boolean
    error: string | null
  }>({ retention: null, loaded: false, error: null })
  const [reloads, setReloads] = React.useState(0)
  const [link, setLink] = React.useState("")
  const [linkInvalid, setLinkInvalid] = React.useState(false)
  const [running, setRunning] = React.useState<"post" | "refresh" | "remove" | null>(
    null
  )

  React.useEffect(() => {
    let current = true
    loadExportRetention(item.id)
      .then((retention) => {
        if (current) setState({ retention, loaded: true, error: null })
      })
      .catch((error) => {
        if (current) {
          setState({
            retention: null,
            loaded: true,
            error: getRetentionErrorMessage(error),
          })
        }
      })
    return () => {
      current = false
    }
  }, [item.id, reloads])

  const { retention, loaded, error } = state
  if (loaded && !error && !retention) return null

  const reload = () => setReloads((count) => count + 1)

  async function run(
    kind: "post" | "refresh" | "remove",
    action: () => Promise<ExportRetention>,
    done: string
  ) {
    setRunning(kind)
    dismissErrorToast()
    try {
      const next = await action()
      setState({ retention: next, loaded: true, error: null })
      if (kind === "post") setLink("")
      toast.success(done)
    } catch (failure) {
      showErrorToast(getRetentionErrorMessage(failure))
      // Pasting keeps the link even when the figures could not be read, so
      // the card is read again to show what was kept.
      if (kind === "post") reload()
    } finally {
      setRunning(null)
    }
  }

  function post() {
    try {
      readYoutubeVideoId(link)
    } catch {
      setLinkInvalid(true)
      showErrorToast(YOUTUBE_LINK_INVALID_MESSAGE)
      return
    }
    setLinkInvalid(false)
    void run(
      "post",
      () => postExportYoutubeLink(item.id, link),
      "Link saved and YouTube's figures read."
    )
  }

  const posted = retention?.posted ?? null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Posted on YouTube</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!loaded ? (
          <LoadingRow label="Reading what was kept…" />
        ) : error ? (
          <ErrorRow message={error} onRetry={reload} />
        ) : !retention ? null : !posted ? (
          retention.channel_title ? (
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={`export-youtube-link-${item.id}`}
                hint={`The video's link on ${retention.channel_title}, or its 11-letter id. It has to be on that channel.`}
              >
                YouTube link
              </FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`export-youtube-link-${item.id}`}
                  className="sm:flex-1"
                  placeholder="https://youtube.com/shorts/…"
                  autoComplete="off"
                  maxLength={YOUTUBE_LINK_MAX}
                  value={link}
                  aria-invalid={linkInvalid || undefined}
                  onChange={(event) => {
                    setLink(event.target.value)
                    setLinkInvalid(false)
                  }}
                  onKeyDown={(event) => {
                    // The window is a form; Enter here reads the link rather
                    // than saving the title.
                    if (event.key === "Enter") {
                      event.preventDefault()
                      if (running === null) post()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={running !== null}
                  onClick={post}
                >
                  {running === "post" ? <Loader2Icon className="animate-spin" /> : null}
                  Read its figures
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Connect your YouTube channel to see where viewers of this video
                stopped watching.
              </p>
              <Button asChild variant="outline">
                <Link to="/admin/settings/$tab" params={{ tab: "youtube" }}>
                  Open Settings
                </Link>
              </Button>
            </div>
          )
        ) : (
          <PostedFigures
            retention={retention}
            posted={posted}
            running={running}
            onRefresh={() =>
              void run(
                "refresh",
                () => refreshExportYoutube(item.id),
                "YouTube's figures read again."
              )
            }
            onRemove={() =>
              void run(
                "remove",
                () => removeExportYoutubeLink(item.id),
                "Link removed. Nothing on YouTube changed."
              )
            }
          />
        )}
      </CardContent>
    </Card>
  )
}

function PostedFigures({
  retention,
  posted,
  running,
  onRefresh,
  onRemove,
}: {
  retention: ExportRetention
  posted: NonNullable<ExportRetention["posted"]>
  running: "post" | "refresh" | "remove" | null
  onRefresh: () => void
  onRemove: () => void
}) {
  const exportSeconds = Math.round(retention.export_length_ms / 1000)
  const lengthsDiffer =
    exportSeconds > 0 && Math.abs(posted.length_seconds - exportSeconds) > 1
  const notes: string[] = []
  if (posted.other_channel && retention.channel_title) {
    notes.push(channelChangedMessage(retention.channel_title))
  }
  if (figuresMayLag(posted.published_at)) {
    notes.push(
      `This video went up less than ${FIGURES_LAG_HOURS} hours ago. YouTube's figures arrive a day or two late, so the curve may be missing or still filling in.`
    )
  }
  if (lengthsDiffer) {
    notes.push(
      `The video on YouTube runs ${posted.length_seconds} s and this export ${exportSeconds} s, so the scene columns may sit a little off.`
    )
  }
  if (retention.scenes_from_project_now && retention.scenes.length) {
    notes.push(
      "This export was made before exports kept their scenes, so the columns are the project's scenes as they are now."
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <a
            href={posted.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <span className="truncate">{posted.video_title}</span>
            <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0" />
          </a>
          <p className="text-sm text-muted-foreground">
            {posted.read_at
              ? `${(posted.views ?? 0).toLocaleString()} views, and a view lasts ${posted.average_view_seconds ?? 0} s on average. Read ${new Date(posted.read_at).toLocaleString()}.`
              : "YouTube's figures have not been read yet."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={running !== null}
            onClick={onRefresh}
          >
            {running === "refresh" ? <Loader2Icon className="animate-spin" /> : null}
            Refresh
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={running !== null}
            onClick={onRemove}
          >
            {running === "remove" ? <Loader2Icon className="animate-spin" /> : null}
            Remove link
          </Button>
        </div>
      </div>

      {notes.map((note) => (
        <p key={note} className="text-sm text-muted-foreground">
          {note}
        </p>
      ))}

      {posted.points?.length ? (
        <RetentionChart
          points={posted.points}
          lengthSeconds={posted.length_seconds}
          scenes={retention.scenes}
        />
      ) : posted.read_at ? (
        <p className="text-sm text-muted-foreground">
          YouTube has no curve for this video yet. It draws one once enough
          people have watched.
        </p>
      ) : null}
    </div>
  )
}
