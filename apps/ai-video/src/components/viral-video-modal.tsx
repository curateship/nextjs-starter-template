import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  LayoutTemplateIcon,
  Loader2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getViralVideo,
  getViralVideoErrorMessage,
  type SegmentRole,
  type ViralVideoDetail,
  type ViralVideoItem,
} from "@/lib/api/viral-videos"
import {
  createProjectFromTemplate,
  createTemplateFromViralVideo,
  getTemplateErrorMessage,
} from "@/lib/api/video-templates"
import { cn } from "@/lib/utils"
import { dateFormatter, formatCount } from "@/lib/dashboard-format"

// Badge tint per narrative role so the pattern reads at a glance.
const ROLE_BADGE_CLASSES: Record<SegmentRole, string> = {
  hook: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  problem: "bg-red-500/15 text-red-700 dark:text-red-400",
  agitation: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  solution: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  proof: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  cta: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  other: "bg-muted text-muted-foreground",
}

const ROLE_LABELS: Record<SegmentRole, string> = {
  hook: "Hook",
  problem: "Problem",
  agitation: "Agitation",
  solution: "Solution",
  proof: "Proof",
  cta: "CTA",
  other: "Other",
}

// ms -> "0:03.4" (tenths matter at reel pacing).
function formatTimecode(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds.toFixed(1)}`
}

// Fetch outcome tagged with its video id so a stale result from a previously
// viewed video is ignored without resetting state inside the effect.
type LoadResult =
  | { videoId: string; detail: ViralVideoDetail }
  | { videoId: string; error: string }

// Analysis modal for one archived video: player + engagement stats + detected
// pattern segments and transcript, with Create Template in the footer.
// Accepts either a full ViralVideoItem (Viral Archive) or just a videoId string
// (Templates dashboard — no item in hand, id sufficient to load detail).
export function ViralVideoModal({
  video,
  videoId: videoIdProp,
  templateId,
  onOpenChange,
}: {
  video?: ViralVideoItem | null
  videoId?: string | null
  // When set, the footer shows "Use Template" instead of "Create Template".
  templateId?: string | null
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const videoId = video?.id ?? videoIdProp ?? null
  const [result, setResult] = React.useState<LoadResult | null>(null)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  // Last clicked timestamp, tagged with its video id so opening a different
  // video drops the selection without an effect (same idea as LoadResult).
  const [activeSeek, setActiveSeek] = React.useState<{
    videoId: string
    key: string
  } | null>(null)
  const activeSeekKey = activeSeek?.videoId === videoId ? activeSeek.key : null
  const [templateOpen, setTemplateOpen] = React.useState(false)
  const [templateName, setTemplateName] = React.useState("")
  const [templateError, setTemplateError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  // Load the full breakdown when a video is opened; the previous result is
  // ignored via the id tag, so no state resets are needed here.
  React.useEffect(() => {
    if (!videoId) return
    let active = true

    getViralVideo(videoId)
      .then((data) => {
        if (active) setResult({ videoId, detail: data })
      })
      .catch((loadError) => {
        if (active)
          setResult({ videoId, error: getViralVideoErrorMessage(loadError) })
      })

    return () => {
      active = false
    }
  }, [videoId])

  const current = result?.videoId === videoId ? result : null
  const detail = current && "detail" in current ? current.detail : null
  const analysis = detail?.analysis ?? null

  // Seeks the native player to a timestamp and starts playback. No-ops when
  // the video element isn't mounted (missing media). A rejected play() (e.g.
  // autoplay policy) is ignored — the seek still lands, controls still work.
  function seekToMs(ms: number, key: string) {
    const player = videoRef.current
    if (!player || !videoId) return
    player.currentTime = ms / 1000
    void player.play().catch(() => undefined)
    setActiveSeek({ videoId, key })
  }

  function openTemplateDialog() {
    if (!detail) return
    setTemplateName(detail.title ?? "")
    setTemplateError(null)
    setTemplateOpen(true)
  }

  async function handleCreateTemplate() {
    if (!detail) return
    setCreating(true)
    setTemplateError(null)
    try {
      await createTemplateFromViralVideo(detail.id, templateName)
      void navigate({ to: "/admin/templates" })
    } catch (createError) {
      setTemplateError(getTemplateErrorMessage(createError))
      setCreating(false)
    }
  }

  async function handleUseTemplate() {
    if (!templateId) return
    setCreating(true)
    setTemplateError(null)
    try {
      const { projectId } = await createProjectFromTemplate(templateId)
      void navigate({ to: "/admin/video-editor/$projectId", params: { projectId } })
    } catch (useError) {
      setTemplateError(getTemplateErrorMessage(useError))
      setCreating(false)
    }
  }

  const createDisabled = creating || !templateName.trim()

  return (
    <>
      <Dialog open={!!videoId} onOpenChange={onOpenChange}>
        <DialogContent
          variant="admin"
          className="data-[variant=admin]:sm:max-w-6xl"
        >
          <DialogHeader>
            <DialogTitle className="truncate pr-8">
              {video?.title ?? video?.source_url ?? detail?.title ?? detail?.source_url ?? "Video"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {current && "error" in current ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{current.error}</span>
              </div>
            ) : !detail ? (
              <div className="grid h-64 place-items-center">
                <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
                {/* Player with the engagement stats as plain rows below it */}
                <div>
                  {detail.media_url ? (
                    <video
                      ref={videoRef}
                      controls
                      playsInline
                      src={detail.media_url}
                      className="w-full rounded-lg border bg-black"
                    />
                  ) : (
                    <div className="grid aspect-[9/16] w-full place-items-center rounded-lg border bg-muted text-sm text-muted-foreground">
                      No video yet
                    </div>
                  )}
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <StatRow
                      label="Views"
                      value={formatCount(detail.stats?.views)}
                    />
                    <StatRow
                      label="Likes"
                      value={formatCount(detail.stats?.likes)}
                    />
                    <StatRow
                      label="Comments"
                      value={formatCount(detail.stats?.comments)}
                    />
                    <StatRow
                      label="Length"
                      value={
                        detail.duration_ms
                          ? formatTimecode(detail.duration_ms)
                          : "—"
                      }
                    />
                    <StatRow
                      label="Posted"
                      value={
                        detail.stats?.postedAt
                          ? dateFormatter.format(
                              new Date(detail.stats.postedAt)
                            )
                          : "—"
                      }
                    />
                    <StatRow label="Author" value={detail.author ?? "—"} />
                  </dl>
                </div>

                <div className="min-w-0 space-y-5">
                  {/* Narrative pattern — one card, segments flattened inside */}
                  <section>
                    {analysis?.segments.length ? (
                      <div className="rounded-lg border">
                        <div className="px-3 pb-3 pt-2">
                          <h3 className="text-base font-semibold">Pattern</h3>
                        </div>
                        <div>
                          {analysis.segments.map((segment, index) => (
                            <button
                              key={`${segment.role}-${index}`}
                              type="button"
                              aria-label={`Play ${ROLE_LABELS[segment.role]} at ${formatTimecode(segment.startMs)}`}
                              onClick={() =>
                                seekToMs(segment.startMs, `segment-${index}`)
                              }
                              className={cn(
                                "block w-full cursor-pointer p-3 text-left transition-colors last:rounded-b-lg hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                                activeSeekKey === `segment-${index}` &&
                                  "bg-muted/60"
                              )}
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <Badge
                                  className={cn(
                                    "border-transparent",
                                    ROLE_BADGE_CLASSES[segment.role]
                                  )}
                                >
                                  {ROLE_LABELS[segment.role]}
                                </Badge>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {formatTimecode(segment.startMs)} –{" "}
                                  {formatTimecode(segment.endMs)}
                                </span>
                              </div>
                              <p className="text-sm">{segment.summary}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No pattern breakdown yet.
                      </p>
                    )}
                  </section>

                  {/* Scenes + transcript share one card */}
                  <div className="space-y-4 rounded-lg border p-3">
                    {analysis?.scenes.length ? (
                      <section>
                        <h2 className="mb-3 text-base font-semibold">
                          Scenes ({analysis.scenes.length})
                        </h2>
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.scenes.map((scene, index) => (
                            <Badge
                              key={index}
                              asChild
                              variant="outline"
                              className="font-mono"
                            >
                              <button
                                type="button"
                                aria-label={`Play scene ${index + 1} at ${formatTimecode(scene.startMs)}`}
                                onClick={() =>
                                  seekToMs(scene.startMs, `scene-${index}`)
                                }
                                className={cn(
                                  "cursor-pointer transition-colors hover:bg-muted",
                                  activeSeekKey === `scene-${index}` &&
                                    "bg-muted"
                                )}
                              >
                                {(
                                  (scene.endMs - scene.startMs) /
                                  1000
                                ).toFixed(1)}
                                s
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <section>
                      <h2 className="mb-3 text-base font-semibold">
                        Transcript
                      </h2>
                      {analysis?.transcript.length ? (
                        <ScrollArea className="h-56">
                          <div className="space-y-1.5 pr-3">
                            {analysis.transcript.map((line, index) => (
                              <button
                                key={index}
                                type="button"
                                aria-label={`Play transcript at ${formatTimecode(line.startMs)}`}
                                onClick={() =>
                                  seekToMs(line.startMs, `transcript-${index}`)
                                }
                                className={cn(
                                  "block w-full cursor-pointer rounded-md px-1.5 py-0.5 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                  activeSeekKey === `transcript-${index}` &&
                                    "bg-muted/60"
                                )}
                              >
                                <span className="mr-2 font-mono text-xs text-muted-foreground">
                                  {formatTimecode(line.startMs)}
                                </span>
                                {line.text}
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No transcript yet.
                        </p>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {templateId ? (
              <Button
                type="button"
                disabled={creating || !detail}
                onClick={handleUseTemplate}
              >
                {creating ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <LayoutTemplateIcon className="size-4" />
                )}
                {creating ? "Opening…" : "Use Template"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!detail || detail.status !== "ready"}
                onClick={openTemplateDialog}
              >
                <LayoutTemplateIcon className="size-4" />
                Create Template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template naming — stacked over the analysis modal */}
      <Dialog
        open={templateOpen}
        onOpenChange={(open) => {
          setTemplateOpen(open)
          if (!open) setCreating(false)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-5">
              {templateError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{templateError}</span>
                </div>
              ) : null}

              <p className="text-sm text-muted-foreground">
                The template copies this video's scene structure — every slot
                keeps the original timing and can be replaced with your own
                footage in the editor.
              </p>

              <div className="grid gap-2">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Template name"
                  onKeyDown={(event) => {
                    // Enter submits the single-field form.
                    if (event.key === "Enter" && !createDisabled) {
                      void handleCreateTemplate()
                    }
                  }}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createDisabled}
              onClick={handleCreateTemplate}
            >
              {creating ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <LayoutTemplateIcon className="size-4" />
              )}
              {creating ? "Creating" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// One label/value line under the player (plain rows, no card chrome).
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium" title={value}>
        {value}
      </dd>
    </div>
  )
}
