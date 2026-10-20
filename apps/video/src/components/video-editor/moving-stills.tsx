import * as React from "react"
import { AlertCircleIcon, FilmIcon, Loader2Icon, RotateCwIcon, XIcon } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { toast } from "sonner"

import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import {
  CONTEXT_MENU_CONTENT_CLASS,
  CONTEXT_MENU_ITEM_CLASS,
} from "@/components/shared/editor-media-context-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  useEditorLock,
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  MovingStillsContext,
  useMovingStills,
  type MovingStillsValue,
} from "@/components/video-editor/moving-stills-context"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import {
  createStillShot,
  deleteGenerations,
  getGenerationErrorMessage,
  listStillShots,
  retryGeneration,
  settleStillShot,
  type GenerationItem,
} from "@/lib/api/video/generations"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  DEFAULT_VIDEO_QUALITY,
  pieceCostCents,
  qualityPrice,
  shotCostCents,
  shotPieces,
  shotPriceLine,
  VIDEO_MODEL,
  VIDEO_QUALITIES,
  videoQualityName,
  type ShotLengthSeconds,
  type VideoQuality,
} from "@/lib/video/asset-factories"
import {
  landMovingShot,
  MOVING_STILL_BUSY_MESSAGE,
  stillRefusal,
  stillShotLengths,
  type MovingPiece,
} from "@/lib/video/moving-still"
import { formatCents, isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { editorId, formatClock } from "@/lib/video/timeline-utils"

/**
 * Making a picture on the timeline move where it sits
 * (`workspace/docs/animate-a-still.md`). The provider keeps this project's
 * shots that have not landed, asks again while one is being made, and lands
 * a finished one in its picture's place as one Undo step. The background
 * worker lands it instead whenever no editor has the project open.
 */

/** How often the editor asks again while a shot is being made. */
const STILL_RECHECK_MS = 5000

function shotWorking(shot: GenerationItem) {
  return shot.status !== "error"
}

function readyPieces(shot: GenerationItem): MovingPiece[] {
  return shot.pieces.flatMap((piece) =>
    piece.output
      ? [
          {
            mediaId: piece.output.id,
            url: piece.output.playback_url,
            durationMs: piece.duration_seconds * 1000,
          },
        ]
      : []
  )
}

export function MovingStillsProvider({ children }: { children: React.ReactNode }) {
  const { store, dispatch, projectId, saveNow } = useEditorRuntime()
  const { openSettings, refreshSpend } = useProjectSettings()
  const lock = useEditorLock()
  const [shots, setShots] = React.useState<GenerationItem[]>([])
  const [quality, setQuality] = React.useState<VideoQuality>(DEFAULT_VIDEO_QUALITY)
  const [editing, setEditing] = React.useState<EditorClip | null>(null)
  // Shots this window has started landing, so a later answer that still
  // lists one never lands it twice.
  const landing = React.useRef(new Set<string>())

  const reportError = React.useCallback(
    (message: string) => {
      showErrorToast(
        message,
        isProjectSpendLimitMessage(message)
          ? { label: "Raise limit", onClick: openSettings }
          : undefined
      )
    },
    [openSettings]
  )

  React.useEffect(() => {
    let active = true
    listStillShots(projectId)
      .then((loaded) => {
        if (!active) return
        setShots(loaded.shots)
        setQuality(loaded.quality)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [projectId])

  // While a shot is being made or waiting to land, ask again. A failed one
  // waits for Try again, so it asks nothing.
  const waiting = shots.some(shotWorking)
  React.useEffect(() => {
    if (!waiting) return
    let active = true
    const timer = setInterval(() => {
      listStillShots(projectId)
        .then((loaded) => {
          if (active) setShots(loaded.shots)
        })
        .catch(() => undefined)
    }, STILL_RECHECK_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [waiting, projectId])

  // A finished shot lands here when this window can save. The server is told
  // first, so the worker cannot land the same shot in the same moment; only
  // then does the picture change, as one Undo step. A read-only window leaves
  // it to the worker.
  React.useEffect(() => {
    if (lock) return
    for (const shot of shots) {
      if (shot.status !== "ready" || !shot.clip || landing.current.has(shot.id)) continue
      const { id: clipId, still_media_id: stillMediaId } = shot.clip
      const pieces = readyPieces(shot)
      const still = landMovingShot(store.getSnapshot().state.tracks, {
        clipId,
        stillMediaId,
        pieces,
        newId: editorId,
      })
      landing.current.add(shot.id)
      settleStillShot(shot.id, still.outcome)
        .then(({ settled }) => {
          setShots((current) => current.filter((item) => item.id !== shot.id))
          refreshSpend()
          if (!settled) return
          store.refreshMediaShelf()
          if (still.outcome === "gone") {
            toast("A moving shot arrived after its picture was deleted. It is in Media.")
            return
          }
          dispatch({ type: "LAND_MOVING_SHOT", clipId, stillMediaId, pieces })
          toast.success("The picture moves now. Undo brings the still back.")
        })
        .catch(() => {
          // Asked again on the next answer.
          landing.current.delete(shot.id)
        })
    }
  }, [shots, lock, store, dispatch, refreshSpend])

  const value = React.useMemo<MovingStillsValue>(() => {
    const byClip = new Map(
      shots.flatMap((shot) => (shot.clip ? [[shot.clip.id, shot] as const] : []))
    )
    return {
      shotFor: (clipId) => byClip.get(clipId),
      open: (clipId) => {
        if (store.refuseIfLocked()) return
        const clip = store
          .getSnapshot()
          .state.tracks.flatMap((track) => track.clips)
          .find((candidate) => candidate.id === clipId)
        if (!clip || clip.kind !== "image") return
        const refusal = stillRefusal(clip)
        if (refusal) {
          reportError(refusal)
          return
        }
        const current = byClip.get(clipId)
        if (current && shotWorking(current)) {
          reportError(MOVING_STILL_BUSY_MESSAGE)
          return
        }
        setEditing(clip)
      },
      retry: (shot) => {
        if (store.refuseIfLocked()) return
        retryGeneration(shot.id)
          .then((updated) =>
            setShots((current) =>
              current.map((item) => (item.id === shot.id ? updated : item))
            )
          )
          .catch((error: unknown) => reportError(getGenerationErrorMessage(error)))
      },
      clear: (shot) => {
        deleteGenerations([shot.id])
          .then(() =>
            setShots((current) => current.filter((item) => item.id !== shot.id))
          )
          .catch((error: unknown) => reportError(getGenerationErrorMessage(error)))
      },
    }
  }, [shots, store, reportError])

  async function make(draft: StillDraft) {
    if (!editing) return
    // The server reads the picture off the saved timeline, so a picture just
    // dropped or trimmed goes first.
    await saveNow()
    const shot = await createStillShot({
      projectId,
      clipId: editing.id,
      prompts: draft.prompts,
      lengthSeconds: draft.lengthSeconds,
      quality: draft.quality,
    })
    setQuality(draft.quality)
    setShots((current) => [
      ...current.filter((item) => item.clip?.id !== editing.id),
      shot,
    ])
    setEditing(null)
    toast.success(
      "Making it move. It takes a few minutes and carries on if you close the tab."
    )
  }

  return (
    <MovingStillsContext.Provider value={value}>
      {children}
      {editing ? (
        <AnimateStillDialog
          key={editing.id}
          clip={editing}
          startQuality={quality}
          onClose={() => setEditing(null)}
          onMake={make}
          onError={(error) => reportError(getGenerationErrorMessage(error))}
        />
      ) : null}
    </MovingStillsContext.Provider>
  )
}

type StillDraft = {
  prompts: string[]
  lengthSeconds: ShotLengthSeconds
  quality: VideoQuality
}

/**
 * The Make it move window: the picture, what should move, the length and
 * size, the project's look when it has one, and the price on the button.
 */
function AnimateStillDialog({
  clip,
  startQuality,
  onClose,
  onMake,
  onError,
}: {
  clip: EditorClip
  startQuality: VideoQuality
  onClose: () => void
  onMake: (draft: StillDraft) => Promise<void>
  onError: (error: unknown) => void
}) {
  const { project } = useProjectSettings()
  const lengths = stillShotLengths(clip.durationMs)
  const [lengthSeconds, setLengthSeconds] = React.useState<ShotLengthSeconds>(lengths[0])
  const [quality, setQuality] = React.useState<VideoQuality>(startQuality)
  const [directions, setDirections] = React.useState<string[]>([])
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const pieces = shotPieces(lengthSeconds).count
  const shotCents = shotCostCents(lengthSeconds)
  const secondCents = pieceCostCents(VIDEO_MODEL, 1)
  const seconds = (clip.durationMs / 1000).toFixed(1)
  const dirty = directions.some((line) => line.trim())

  async function submit() {
    const sent = Array.from({ length: pieces }, (_, index) => directions[index]?.trim() ?? "")
    if (sent.some((line) => !line)) {
      setInvalid(true)
      showErrorToast(
        pieces > 1
          ? "Write what moves in each part of the shot."
          : "Write what should move."
      )
      return
    }
    setBusy(true)
    try {
      await onMake({ prompts: sent, lengthSeconds, quality })
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Make it move</DialogTitle>
            <DialogDescription>
              The moving shot takes this picture&apos;s place on the timeline and
              nothing else moves.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The picture</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {clip.url ? (
                    <div className="grid place-items-center overflow-hidden rounded-lg bg-muted">
                      <img
                        src={clip.url}
                        alt={clip.name}
                        draggable={false}
                        className="block max-h-48 w-auto object-contain"
                      />
                    </div>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {seconds} seconds from {formatClock(clip.startMs)}. The shot
                    starts from this exact picture and lands muted.
                  </p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The shot</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {Array.from({ length: pieces }, (_, index) => (
                    <div key={index} className="grid min-w-0 gap-2">
                      <Label htmlFor={`still-direction-${index}`}>
                        {pieces > 1
                          ? `What moves, seconds ${index * 8} to ${(index + 1) * 8}`
                          : "What moves"}
                      </Label>
                      <Textarea
                        id={`still-direction-${index}`}
                        rows={1}
                        maxLength={5000}
                        value={directions[index] ?? ""}
                        disabled={busy}
                        aria-invalid={(invalid && !directions[index]?.trim()) || undefined}
                        placeholder="Waves crashing, the lamp turning"
                        onChange={(event) => {
                          const next = [...directions]
                          next[index] = event.target.value
                          setDirections(next)
                          setInvalid(false)
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="still-length">Length</Label>
                      <Select
                        value={String(lengthSeconds)}
                        onValueChange={(next) =>
                          setLengthSeconds(Number(next) as ShotLengthSeconds)
                        }
                        disabled={busy}
                      >
                        <SelectTrigger id="still-length">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {lengths.map((length) => (
                            <SelectItem key={length} value={String(length)}>
                              {length} seconds
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="still-quality">Quality</Label>
                      <Select
                        value={quality}
                        onValueChange={(next) => setQuality(next as VideoQuality)}
                        disabled={busy}
                      >
                        <SelectTrigger id="still-quality">
                          <SelectValue>{videoQualityName(quality)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {VIDEO_QUALITIES.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.label} {item.id} ·{" "}
                              {qualityPrice(item.id, secondCents, shotCents)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lengthSeconds * 1000 > clip.durationMs
                      ? `Trimmed back to the picture's ${seconds} seconds when it lands. `
                      : ""}
                    {shotPriceLine(quality, lengthSeconds, secondCents, shotCents)}
                  </p>
                  {project.look?.style ? (
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      Sent with it: the project&apos;s style line, &quot;{project.look.style}&quot;
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : <FilmIcon />}
                Make it move · {formatCents(shotCents)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The right-click menu on a picture clip. Outside the editor itself, such as
 * the History preview, the clip is drawn without one.
 */
export function StillContextMenu({
  clipId,
  children,
}: {
  clipId: string
  children: React.ReactElement
}) {
  const stills = useMovingStills()
  if (!stills) return children
  const shot = stills.shotFor(clipId)
  const failed = shot?.status === "error" ? shot : null
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className={CONTEXT_MENU_CONTENT_CLASS}
          // The menu sits in a portal, but React still hands its presses up
          // to the timeline, which would take the pointer for scrubbing and
          // leave the item never chosen.
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ContextMenuPrimitive.Item
            className={CONTEXT_MENU_ITEM_CLASS}
            onSelect={() => stills.open(clipId)}
          >
            <FilmIcon />
            Make it move…
          </ContextMenuPrimitive.Item>
          {failed ? (
            <>
              <ContextMenuPrimitive.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onSelect={() => stills.retry(failed)}
              >
                <RotateCwIcon />
                Try again
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onSelect={() => stills.clear(failed)}
              >
                <XIcon />
                Clear the failed try
              </ContextMenuPrimitive.Item>
            </>
          ) : null}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}

/**
 * The inspector's way in, beside the right-click menu: the same window, the
 * same Try again and Clear. While a shot is being made it says so instead of
 * offering another, and a picture that cannot move says why up front.
 */
export function MakeItMoveCard({ clip }: { clip: EditorClip }) {
  const stills = useMovingStills()
  if (!stills || clip.kind !== "image") return null
  const shot = stills.shotFor(clip.id)
  const refusal = stillRefusal(clip)

  if (shot?.status === "error") {
    return (
      <InspectorCard
        title="Make it move"
        description={`Couldn't make it move. ${shot.error_message ?? "The shot could not be made."}`}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => stills.retry(shot)}>
            <RotateCwIcon />
            Try again
          </Button>
          <Button type="button" variant="ghost" className="flex-1" onClick={() => stills.clear(shot)}>
            <XIcon />
            Clear the failed try
          </Button>
        </div>
      </InspectorCard>
    )
  }
  if (shot) {
    return (
      <InspectorCard
        title="Make it move"
        description="It takes a few minutes, and the moving shot takes this picture's place by itself."
      >
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          <Loader2Icon aria-hidden className="size-4 motion-safe:animate-spin" />
          Making it move
        </p>
      </InspectorCard>
    )
  }
  if (refusal) {
    return (
      <InspectorCard title="Make it move">
        <p className="text-sm leading-relaxed text-muted-foreground">{refusal}</p>
      </InspectorCard>
    )
  }
  const shortest = stillShotLengths(clip.durationMs)[0]
  return (
    <InspectorCard
      title="Make it move"
      description={`Google turns this picture into a moving shot in the same place, from ${formatCents(shotCostCents(shortest))}.`}
    >
      <Button type="button" variant="outline" className="w-full" onClick={() => stills.open(clip.id)}>
        <FilmIcon />
        Make it move…
      </Button>
    </InspectorCard>
  )
}

/**
 * The "Making it move" marker along the bottom of a picture clip, drawn the
 * same way as a video clip's "Getting frames ready". A failed try says so,
 * with the reason on hover and Try again beside it.
 */
export function StillMarker({ clipId, roomy }: { clipId: string; roomy: boolean }) {
  const stills = useMovingStills()
  const shot = stills?.shotFor(clipId)
  if (!stills || !shot) return null
  const failed = shot.status === "error"
  const label = failed ? "Couldn't make it move" : "Making it move"
  return (
    <span
      role="status"
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 6,
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontWeight: 600,
        color: "#fff",
        whiteSpace: "nowrap",
        overflow: "hidden",
        zIndex: 3,
        textShadow: "0 1px 3px rgba(0,0,0,.6)",
      }}
    >
      {failed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={`${label}: ${shot.error_message ?? "the shot could not be made"}`}
              style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}
            >
              <AlertCircleIcon aria-hidden className="shrink-0" size={10} />
              {roomy ? (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64">
            {shot.error_message ?? "The shot could not be made."}
          </TooltipContent>
        </Tooltip>
      ) : (
        <>
          <Loader2Icon aria-hidden className="shrink-0 motion-safe:animate-spin" size={10} />
          {roomy ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          ) : (
            <span className="sr-only">{label}</span>
          )}
        </>
      )}
      {failed && roomy ? (
        <button
          type="button"
          // A press here is not the start of a drag of the clip.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => stills.retry(shot)}
          style={{
            flex: "none",
            padding: "0 5px",
            borderRadius: 4,
            background: "rgba(0,0,0,.45)",
            color: "#fff",
            fontSize: 9,
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      ) : null}
    </span>
  )
}
