import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ClapperboardIcon,
  FilmIcon,
  GalleryHorizontalIcon,
  Loader2Icon,
  RotateCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { AiClipExtras } from "@/components/video-editor/ai-clip-extras"
import { AiClipNewActor } from "@/components/video-editor/ai-clip-new-actor"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InspectorCard } from "@/components/shared/inspector-card"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { buildMediaClip } from "@/components/video-editor/media-clip"
import { useProjectSettings } from "@/components/video-editor/project-settings-context"
import { useDragToTimeline } from "@/components/video-editor/use-drag-to-timeline"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { listActors, type ActorItem } from "@/lib/api/video/actors"
import {
  getExtraErrorMessage,
  listExtras,
  readProjectExtraPicks,
  saveProjectExtraPicks,
  type ExtraItem,
} from "@/lib/api/video/extras"
import {
  createCarouselFromFirstFrames,
  getCarouselErrorMessage,
  type CarouselFormat,
} from "@/lib/api/video/carousels"
import { CAROUSEL_FORMATS } from "@/lib/video/carousel-schema"
import {
  createFirstFrames,
  deleteFirstFrames,
  getFirstFrameErrorMessage,
  listFirstFrames,
  type FirstFrameItem,
} from "@/lib/api/video/first-frames"
import {
  createGeneration,
  deleteGenerations,
  getGenerationErrorMessage,
  listGenerations,
  retryGeneration,
  SHOT_LENGTHS,
  type GenerationItem,
} from "@/lib/api/video/generations"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  ASSET_ASPECT_RATIOS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_QUALITY,
  pieceCostCents,
  PRICED_VIDEO_QUALITY,
  PROJECT_SHOTS_FULL_MESSAGE,
  projectClipAspect,
  shotCostCents,
  shotPieces,
  SHOTS_AT_ONCE_PER_PROJECT,
  VIDEO_MODEL,
  VIDEO_QUALITIES,
  videoQualityName,
  type AssetAspectRatio,
  type ShotLengthSeconds,
  type VideoQuality,
} from "@/lib/video/asset-factories"
import {
  BOARD_FULL_MESSAGE,
  BOARD_TILES,
  boardExtraCount,
  type ExtraPicks,
} from "@/lib/video/extras"
import {
  formatCents,
  isProjectSpendLimitMessage,
} from "@/lib/video/project-spend"
import { cn } from "@/lib/utils"

/**
 * The AI clip panel: an actor, a first frame of them, a moving shot from that
 * frame, then the shot dragged onto the timeline. Four steps, each one
 * waiting for the one before, because each needs what the last one made.
 * Under the steps sits everything this project has made, so a clip can be
 * dragged in again later (see `workspace/docs/ai-clip.md`).
 *
 * Actors are shared across projects; first frames and shots belong to this
 * project alone. A shot is made by the background worker, so closing the
 * panel or the tab never stops it, and the panel asks again while one is
 * being made. Up to three shots can be made at once, so several directions
 * for one frame can be tried side by side (`workspace/docs/several-ai-clips.md`).
 */

/** How often the panel asks again while a shot is being made. */
const SHOT_RECHECK_MS = 5000

type Draggable =
  | { kind: "frame"; frame: FirstFrameItem }
  | { kind: "shot"; shot: GenerationItem }

function shotWorking(shot: GenerationItem) {
  return shot.status === "queued" || shot.status === "processing"
}

export function AiClipPanel() {
  const { dispatch, projectId, saveNow } = useEditorRuntime()
  const { project, openSettings, refreshSpend } = useProjectSettings()
  const navigate = useNavigate()
  const editorAspect = useEditorSelector((state) => state.aspect)

  const [actors, setActors] = React.useState<ActorItem[] | null>(null)
  const [extras, setExtras] = React.useState<ExtraItem[] | null>(null)
  // The extras picked, kept on the project so a series keeps its outfit.
  const [extraPicks, setExtraPicks] = React.useState<ExtraPicks>({})
  const [frames, setFrames] = React.useState<FirstFrameItem[] | null>(null)
  const [shots, setShots] = React.useState<GenerationItem[] | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [reloads, setReloads] = React.useState(0)

  const [pickedActorId, setPickedActorId] = React.useState<string | null>(null)
  const [scene, setScene] = React.useState("")
  const [sceneInvalid, setSceneInvalid] = React.useState(false)
  const [variants, setVariants] = React.useState(2)
  // The sheet pictures picked for the actor they were picked on.
  const [pickedPictures, setPickedPictures] = React.useState<{
    actorId: string
    ids: string[]
  } | null>(null)
  const [chosenShape, setChosenShape] = React.useState<AssetAspectRatio>("9:16")
  const [framesBusy, setFramesBusy] = React.useState(false)
  const [pickedFrameId, setPickedFrameId] = React.useState<string | null>(null)
  const [lengthSeconds, setLengthSeconds] = React.useState<ShotLengthSeconds>(8)
  // The size the last shot was made at, until another is picked.
  const [quality, setQuality] = React.useState<VideoQuality>(DEFAULT_VIDEO_QUALITY)
  const [directions, setDirections] = React.useState<string[]>([""])
  const [directionsInvalid, setDirectionsInvalid] = React.useState(false)
  const [shotBusy, setShotBusy] = React.useState(false)
  const [busyRowId, setBusyRowId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<Draggable | null>(null)
  const [carouselOpen, setCarouselOpen] = React.useState(false)

  React.useEffect(() => {
    let active = true
    Promise.all([
      listActors(),
      listFirstFrames(projectId),
      listGenerations(projectId),
      listExtras(),
      readProjectExtraPicks(projectId),
    ])
      .then(([actorList, frameList, shotList, extraList, picked]) => {
        if (!active) return
        setActors(actorList.actors.filter((actor) => actor.status === "active"))
        setExtras(extraList.extras)
        setExtraPicks(picked.picks)
        setFrames(frameList.firstFrames)
        setShots(shotList.generations)
        setQuality(shotList.quality)
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!active) return
        setLoadFailed(true)
        showErrorToast(getFirstFrameErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [projectId, reloads])

  // While a shot is being made, ask again. The spend line moves when one
  // finishes, because a shot is paid for once the clip is made.
  const makingCount = shots?.filter(shotWorking).length ?? 0
  const working = makingCount > 0
  React.useEffect(() => {
    if (!working) return
    let active = true
    const timer = setInterval(() => {
      listGenerations(projectId)
        .then((loaded) => {
          if (!active) return
          setShots(loaded.generations)
          if (!loaded.generations.some(shotWorking)) refreshSpend()
        })
        .catch(() => undefined)
    }, SHOT_RECHECK_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [working, projectId, refreshSpend])

  // What the steps start on before anything is picked: the actor and frame
  // used last in this project.
  // An actor set to Inactive since is passed over, so step 2 never waits on
  // one that cannot be picked.
  const actorId =
    [pickedActorId, frames?.[0]?.actor.id, actors?.[0]?.id].find(
      (id) => id && actors?.some((candidate) => candidate.id === id)
    ) ?? null
  const actor = actors?.find((candidate) => candidate.id === actorId) ?? null
  const frame =
    frames?.find((candidate) => candidate.id === (pickedFrameId ?? "")) ??
    frames?.[0] ??
    null
  // Which of the actor's sheet pictures a first frame is drawn from: the
  // main picture until others are picked. They share the person board with
  // the clothing, hair and prop picked, which holds 4.
  const boardExtras = boardExtraCount(extraPicks)
  const pictureIds = (() => {
    if (!actor) return []
    const picked =
      pickedPictures?.actorId === actor.id
        ? pickedPictures.ids.filter((id) =>
            actor.sheet.some((picture) => picture.id === id)
          )
        : []
    if (picked.length) return picked
    const main = actor.sheet.find((picture) => picture.main)
    return main ? [main.id] : []
  })()
  const projectShape = projectClipAspect(editorAspect)
  const pieces = shotPieces(lengthSeconds).count
  const frameCostCents = aiUnitCostCents(DEFAULT_IMAGE_MODEL, variants)
  const shotCents = shotCostCents(lengthSeconds)
  const secondCents = pieceCostCents(VIDEO_MODEL, 1)
  // The picked frame's newest shots, as many as can be made at once, so
  // directions tried side by side show side by side.
  const frameShots = frame
    ? (shots ?? [])
        .filter((shot) => shot.first_frame_id === frame.id)
        .slice(0, SHOTS_AT_ONCE_PER_PROJECT)
    : []

  function reportError(message: string) {
    showErrorToast(
      message,
      isProjectSpendLimitMessage(message)
        ? { label: "Raise limit", onClick: openSettings }
        : undefined
    )
  }

  function togglePicture(pictureId: string) {
    if (!actor) return
    if (pictureIds.includes(pictureId)) {
      if (pictureIds.length === 1) {
        reportError(`Send at least one picture of ${actor.name}.`)
        return
      }
      setPickedPictures({
        actorId: actor.id,
        ids: pictureIds.filter((id) => id !== pictureId),
      })
      return
    }
    if (pictureIds.length + boardExtras >= BOARD_TILES) {
      reportError(BOARD_FULL_MESSAGE)
      return
    }
    setPickedPictures({ actorId: actor.id, ids: [...pictureIds, pictureId] })
  }

  // The pick shows at once and saves behind it. A refused save puts back what
  // was there, unless another pick has been made since.
  async function changeExtras(next: ExtraPicks) {
    const before = extraPicks
    setExtraPicks(next)
    try {
      await saveProjectExtraPicks(projectId, next)
    } catch (error) {
      setExtraPicks((current) => (current === next ? before : current))
      reportError(getExtraErrorMessage(error))
    }
  }

  async function makeFrames() {
    if (!actor) return
    if (!scene.trim()) {
      setSceneInvalid(true)
      reportError("Say what the scene is first.")
      return
    }
    setFramesBusy(true)
    try {
      // The server reads the project's shape, so a shape just switched goes first.
      await saveNow()
      const result = await createFirstFrames({
        projectId,
        actorId: actor.id,
        prompt: scene,
        variants,
        sheetPictureIds: pictureIds,
        extras: extraPicks,
        aspectRatio: projectShape ? null : chosenShape,
      })
      setFrames((current) => [...result.firstFrames, ...(current ?? [])])
      setPickedFrameId(result.firstFrames[0]?.id ?? null)
      if (result.warning) reportError(result.warning)
      else {
        toast.success(
          `${result.firstFrames.length} ${plural(result.firstFrames.length, "first frame")} made. Pick one and make the shot.`
        )
      }
    } catch (error) {
      reportError(getFirstFrameErrorMessage(error))
    } finally {
      setFramesBusy(false)
      refreshSpend()
    }
  }

  async function makeShot() {
    if (!frame) return
    const sent = directions.slice(0, pieces).map((line) => line.trim())
    if (sent.length !== pieces || sent.some((line) => !line)) {
      setDirectionsInvalid(true)
      reportError(
        pieces > 1
          ? "Write what happens in each part of the shot."
          : "Write what happens in the shot."
      )
      return
    }
    if (makingCount >= SHOTS_AT_ONCE_PER_PROJECT) {
      reportError(PROJECT_SHOTS_FULL_MESSAGE)
      return
    }
    setShotBusy(true)
    try {
      const shot = await createGeneration({
        projectId,
        firstFrameId: frame.id,
        prompts: sent,
        lengthSeconds,
        quality,
      })
      setShots((current) => [shot, ...(current ?? [])])
      toast.success(
        makingCount + 1 < SHOTS_AT_ONCE_PER_PROJECT
          ? "The shot is being made. It takes a few minutes. Change the direction and make another to compare them."
          : "The shot is being made. It takes a few minutes, and you can close this panel meanwhile."
      )
    } catch (error) {
      reportError(getGenerationErrorMessage(error))
    } finally {
      setShotBusy(false)
    }
  }

  async function retryShot(shot: GenerationItem) {
    setBusyRowId(shot.id)
    try {
      const updated = await retryGeneration(shot.id)
      setShots((current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (error) {
      reportError(getGenerationErrorMessage(error))
    } finally {
      setBusyRowId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    const id = deleting.kind === "frame" ? deleting.frame.id : deleting.shot.id
    setBusyRowId(id)
    try {
      if (deleting.kind === "frame") {
        await deleteFirstFrames([id])
        setFrames((current) => (current ?? []).filter((item) => item.id !== id))
        setShots((current) =>
          (current ?? []).filter((shot) => shot.first_frame_id !== id)
        )
      } else {
        await deleteGenerations([id])
        setShots((current) => (current ?? []).filter((item) => item.id !== id))
      }
      setDeleting(null)
    } catch (error) {
      reportError(
        deleting.kind === "frame"
          ? getFirstFrameErrorMessage(error)
          : getGenerationErrorMessage(error)
      )
    } finally {
      setBusyRowId(null)
    }
  }

  async function drop(item: Draggable, atMs: number, trackId?: string) {
    try {
      if (item.kind === "frame") {
        const clip = await buildMediaClip(item.frame.image)
        dispatch({ type: "ADD_CLIP", clip, atMs, trackId })
        return
      }
      // A long shot is several pieces that play back to back, laid down as
      // one paste so they stay together and one Undo takes them all back.
      const outputs = item.shot.pieces.flatMap((piece) => piece.output ?? [])
      let offset = 0
      const clips = []
      for (const output of outputs) {
        const clip = await buildMediaClip(output)
        clips.push({ clip: { ...clip, startMs: offset }, lane: 0 })
        offset += clip.durationMs
      }
      dispatch({ type: "PASTE_CLIPS", clips, atMs, trackId })
    } catch (error) {
      reportError(
        error instanceof Error && error.message
          ? error.message
          : "That clip could not be added."
      )
    }
  }

  const { dragHandlers, ghost } = useDragToTimeline<Draggable>({
    label: (item) =>
      item.kind === "frame" ? item.frame.name : `${item.shot.duration_seconds}s AI clip`,
    onDrop: (item, atMs, trackId) => void drop(item, atMs, trackId),
  })

  function changeLength(next: ShotLengthSeconds) {
    setLengthSeconds(next)
    const count = shotPieces(next).count
    setDirections((current) =>
      Array.from({ length: count }, (_, index) => current[index] ?? "")
    )
  }

  const loading =
    (actors === null || frames === null || shots === null || extras === null) &&
    !loadFailed

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<ClapperboardIcon className="size-4" />}
        title="AI clip"
      />
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="p-4">
            <LoadingRow label="Loading actors and clips" />
          </div>
        ) : loadFailed ? (
          <div className="grid justify-items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            The actors and clips could not be loaded.
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloads((count) => count + 1)}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
            <Step number={1} title="Pick an actor">
              {actors?.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {actors.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      aria-pressed={candidate.id === actorId}
                      onClick={() => setPickedActorId(candidate.id)}
                      className={cn(
                        "grid min-w-0 gap-1 rounded-lg border bg-background p-1 text-left text-xs",
                        candidate.id === actorId &&
                          "border-primary ring-2 ring-primary/30"
                      )}
                    >
                      <img
                        src={candidate.image_url}
                        alt=""
                        draggable={false}
                        className="aspect-square w-full rounded-md bg-muted object-cover"
                      />
                      <span className="truncate font-medium">{candidate.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No actors yet. Make one first: a name, a description, and a
                  photo if you have one.
                </p>
              )}
              <AiClipExtras
                extras={extras ?? []}
                picks={extraPicks}
                angles={pictureIds.length}
                disabled={framesBusy}
                onChange={(next) => void changeExtras(next)}
                onRefuse={reportError}
              >
                <AiClipNewActor
                  projectId={projectId}
                  primary={!actors?.length}
                  onMade={(made) => {
                    setActors((current) => [made, ...(current ?? [])])
                    setPickedActorId(made.id)
                    refreshSpend()
                    toast.success(`${made.name} is ready. Now make a first frame.`)
                  }}
                />
              </AiClipExtras>
            </Step>

            <Step number={2} title="Make a first frame" waiting={!actor}>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="ai-clip-scene">
                  {actor ? `What is ${actor.name} doing, and where?` : "Scene"}
                </Label>
                <Textarea
                  id="ai-clip-scene"
                  rows={1}
                  // A grow-with-the-words box is as wide as its words, which
                  // walks out of this narrow panel; it fills the row instead.
                  className="w-0 min-w-full"
                  value={scene}
                  maxLength={5000}
                  disabled={!actor || framesBusy}
                  aria-invalid={sceneInvalid || undefined}
                  placeholder="Holding a coffee in a bright kitchen"
                  onChange={(event) => {
                    setScene(event.target.value)
                    setSceneInvalid(false)
                  }}
                />
              </div>
              {actor && actor.sheet.length > 1 ? (
                <div className="grid min-w-0 gap-2">
                  <span className="text-sm font-medium" id="ai-clip-pictures">
                    Pictures of {actor.name} to send
                  </span>
                  <div
                    role="group"
                    aria-labelledby="ai-clip-pictures"
                    className="grid grid-cols-4 gap-2"
                  >
                    {actor.sheet.map((picture) => (
                      <button
                        key={picture.id}
                        type="button"
                        aria-pressed={pictureIds.includes(picture.id)}
                        disabled={framesBusy}
                        onClick={() => togglePicture(picture.id)}
                        className={cn(
                          "grid min-w-0 gap-1 rounded-lg border bg-background p-1 text-left text-[0.625rem]",
                          pictureIds.includes(picture.id) &&
                            "border-primary ring-2 ring-primary/30"
                        )}
                      >
                        <img
                          src={picture.url}
                          alt=""
                          draggable={false}
                          className="aspect-[3/4] w-full rounded-md bg-muted object-cover"
                        />
                        <span className="truncate">
                          {picture.label || (picture.main ? "Main" : "No label")}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    These and the clothing, hair and prop picked in Extras go
                    on one board of up to {BOARD_TILES} pictures. The main
                    picture goes first.
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="ai-clip-variants">How many</Label>
                  <Select
                    value={String(variants)}
                    onValueChange={(value) => setVariants(Number(value))}
                    disabled={!actor || framesBusy}
                  >
                    <SelectTrigger id="ai-clip-variants">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {count}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {projectShape ? null : (
                  <div className="grid gap-2">
                    <span className="text-sm font-medium" id="ai-clip-shape">
                      Shape
                    </span>
                    <Tabs
                      value={chosenShape}
                      onValueChange={(value) =>
                        setChosenShape(value as AssetAspectRatio)
                      }
                    >
                      <TabsList aria-labelledby="ai-clip-shape">
                        {ASSET_ASPECT_RATIOS.map((shape) => (
                          <TabsTrigger key={shape} value={shape}>
                            {shape}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {projectShape
                  ? `Made ${projectShape}, the project's shape`
                  : `AI pictures come in 9:16 or 16:9, not ${editorAspect}`}
                {project.look?.style
                  ? `, in its look: ${project.look.style}`
                  : project.look?.picture_url
                    ? ", in the look of its look picture"
                    : ". The project has no look set"}
                . About {formatCents(frameCostCents)} for {variants}.
              </p>
              <Button
                type="button"
                disabled={!actor || framesBusy}
                onClick={() => void makeFrames()}
              >
                {framesBusy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                {framesBusy
                  ? "Making"
                  : `Make ${variants} ${plural(variants, "frame")}`}
              </Button>
            </Step>

            <Step number={3} title="Make the shot" waiting={!frame}>
              {frame ? (
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                  <img
                    src={frame.image.url}
                    alt=""
                    draggable={false}
                    className="aspect-square w-14 rounded-md bg-muted object-cover"
                  />
                  <span className="line-clamp-2 text-xs">
                    From “{frame.name}”. Pick another frame below to change it.
                  </span>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="ai-clip-length">Length</Label>
                <Select
                  value={String(lengthSeconds)}
                  onValueChange={(value) =>
                    changeLength(Number(value) as ShotLengthSeconds)
                  }
                  disabled={!frame || shotBusy}
                >
                  <SelectTrigger id="ai-clip-length">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOT_LENGTHS.map((length) => (
                      <SelectItem key={length} value={String(length)}>
                        {length} seconds
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ai-clip-quality">Quality</Label>
                <Select
                  value={quality}
                  onValueChange={(value) => setQuality(value as VideoQuality)}
                  disabled={!frame || shotBusy}
                >
                  {/* The closed list shows the size alone; the prices are in
                      the open list and the line below, which have the room. */}
                  <SelectTrigger id="ai-clip-quality">
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
              {directions.slice(0, pieces).map((line, index) => (
                <div key={index} className="grid min-w-0 gap-2">
                  <Label htmlFor={`ai-clip-direction-${index}`}>
                    {pieces > 1
                      ? `What happens, seconds ${index * 8} to ${(index + 1) * 8}`
                      : "What happens"}
                  </Label>
                  <Textarea
                    id={`ai-clip-direction-${index}`}
                    rows={1}
                    className="w-0 min-w-full"
                    maxLength={5000}
                    value={line}
                    disabled={!frame || shotBusy}
                    aria-invalid={(directionsInvalid && !line.trim()) || undefined}
                    placeholder="She takes a sip and smiles at the camera"
                    onChange={(event) => {
                      const next = [...directions]
                      next[index] = event.target.value
                      setDirections(next)
                      setDirectionsInvalid(false)
                    }}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {shotPriceLine(quality, lengthSeconds, secondCents, shotCents)}
              </p>
              <Button
                type="button"
                disabled={!frame || shotBusy}
                onClick={() => void makeShot()}
              >
                {shotBusy ? <Loader2Icon className="animate-spin" /> : <FilmIcon />}
                Make the shot
              </Button>
              {working ? (
                <p className="text-xs text-muted-foreground">
                  Making {makingCount} of the {SHOTS_AT_ONCE_PER_PROJECT} shots
                  a project can make at once. Each carries on if you close the
                  panel or the tab.
                </p>
              ) : null}
            </Step>

            <Step
              number={4}
              title="Drag it onto the timeline"
              waiting={!frameShots.length}
            >
              {frameShots.length ? (
                <div className="grid gap-3">
                  {frameShots.map((shot) => (
                    <ShotRow
                      key={shot.id}
                      shot={shot}
                      busy={busyRowId === shot.id}
                      dragHandlers={dragHandlers}
                      onRetry={() => void retryShot(shot)}
                      onDelete={() => setDeleting({ kind: "shot", shot })}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The finished shot shows here. Drag it to where it should play.
                </p>
              )}
            </Step>

            <InspectorCard storageId="video-ai-clip-made" title="Made in this project">
              <StepBody>
              {frames?.length ? (
                <>
                  <ul className="grid gap-3">
                    {frames.map((item) => (
                      <FrameRow
                        key={item.id}
                        frame={item}
                        picked={item.id === frame?.id}
                        shots={(shots ?? []).filter(
                          (shot) => shot.first_frame_id === item.id
                        )}
                        busyRowId={busyRowId}
                        dragHandlers={dragHandlers}
                        onPick={() => {
                          setPickedFrameId(item.id)
                          setPickedActorId(item.actor.id)
                        }}
                        onDelete={() => setDeleting({ kind: "frame", frame: item })}
                        onRetry={(shot) => void retryShot(shot)}
                        onDeleteShot={(shot) => setDeleting({ kind: "shot", shot })}
                      />
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCarouselOpen(true)}
                  >
                    <GalleryHorizontalIcon />
                    Make a carousel
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing yet. First frames and shots made here stay with this
                  project.
                </p>
              )}
              </StepBody>
            </InspectorCard>
          </div>
        )}
      </ScrollArea>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deleting?.kind === "frame" ? "Delete this first frame?" : "Delete this shot?"
        }
        description={
          deleting?.kind === "frame"
            ? "The first frame and the shots made from it leave this panel. Anything already on the timeline stays."
            : "The shot leaves this panel. If it is already on the timeline, it stays there."
        }
        confirmLabel={deleting?.kind === "frame" ? "Delete first frame" : "Delete shot"}
        loading={busyRowId !== null}
        onConfirm={() => void confirmDelete()}
      />

      <CarouselFromFramesDialog
        open={carouselOpen}
        onOpenChange={setCarouselOpen}
        frames={frames ?? []}
        onCreate={async (frameIds, format) => {
          try {
            const carousel = await createCarouselFromFirstFrames(
              projectId,
              frameIds,
              format
            )
            setCarouselOpen(false)
            await navigate({
              to: "/admin/video-carousels/$carouselId",
              params: { carouselId: carousel.id },
            })
          } catch (error) {
            showErrorToast(getCarouselErrorMessage(error))
          }
        }}
      />

      {ghost}
    </div>
  )
}

/**
 * One numbered step, in the same grey card the inspector on the right uses, so
 * each can be shut and stays shut. A step waiting on the one before is dimmed.
 */
function Step({
  number,
  title,
  waiting = false,
  children,
}: {
  number: number
  title: string
  waiting?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("min-w-0", waiting && "opacity-60")}>
      <InspectorCard storageId={`video-ai-clip-step-${number}`} title={`${number}. ${title}`}>
        <StepBody>{children}</StepBody>
      </InspectorCard>
    </div>
  )
}

/**
 * Keeps a card's contents to the card's width. The shared card's own grid
 * widens to its widest button, which in a panel this narrow walks past the
 * edge.
 */
function StepBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {children}
    </div>
  )
}

type DragHandlers = (item: Draggable) => React.HTMLAttributes<HTMLElement>

/** A first frame, which drags as a still, with the shots made from it. */
function FrameRow({
  frame,
  picked,
  shots,
  busyRowId,
  dragHandlers,
  onPick,
  onDelete,
  onRetry,
  onDeleteShot,
}: {
  frame: FirstFrameItem
  picked: boolean
  shots: GenerationItem[]
  busyRowId: string | null
  dragHandlers: DragHandlers
  onPick: () => void
  onDelete: () => void
  onRetry: (shot: GenerationItem) => void
  onDeleteShot: (shot: GenerationItem) => void
}) {
  return (
    <li
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border bg-background p-2",
        picked && "border-primary"
      )}
    >
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
        <button
          type="button"
          aria-label={`${frame.name}. Drag onto a track to add it as a still`}
          {...dragHandlers({ kind: "frame", frame })}
          className="cursor-grab touch-none overflow-hidden rounded-md border bg-muted"
        >
          <img
            src={frame.image.url}
            alt=""
            draggable={false}
            className="block aspect-square w-14 object-cover"
          />
        </button>
        <div className="grid min-w-0 gap-1">
          <span className="line-clamp-2 text-xs font-medium [overflow-wrap:anywhere]">
            {frame.name}
          </span>
          <span className="truncate text-[0.625rem] text-muted-foreground">
            {frame.actor.name} · {frame.aspect_ratio}
          </span>
          {frame.made_from.length ? (
            <span className="line-clamp-2 text-[0.625rem] text-muted-foreground">
              From {frame.made_from.join(", ")}
            </span>
          ) : null}
          {frame.made_with.length ? (
            <span className="line-clamp-2 text-[0.625rem] text-muted-foreground">
              With {frame.made_with.join(", ")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant={picked ? "secondary" : "outline"}
          aria-pressed={picked}
          aria-label={picked ? `${frame.name} is picked for the shot` : `Use ${frame.name} for the shot`}
          onClick={onPick}
        >
          {picked ? "Picked" : "Use"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${frame.name}`}
          disabled={busyRowId === frame.id}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
      {shots.map((shot) => (
        <ShotRow
          key={shot.id}
          shot={shot}
          busy={busyRowId === shot.id}
          dragHandlers={dragHandlers}
          onRetry={() => onRetry(shot)}
          onDelete={() => onDeleteShot(shot)}
        />
      ))}
    </li>
  )
}

/**
 * Where a shot being made has got to. Google gives no percentage, so this is
 * the part it is on and when it was asked for.
 */
function shotProgress(shot: GenerationItem) {
  const started = new Date(shot.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
  if (shot.status === "queued") return `Waiting for its turn since ${started}`
  const part = shot.pieces.findIndex((piece) => piece.status !== "ready") + 1
  const parts = shot.pieces.length > 1 ? `, part ${part} of ${shot.pieces.length}` : ""
  return `${shot.duration_seconds} second shot${parts}, being made since ${started}`
}

/**
 * A size's price beside its name in the Quality list. Google prices only
 * 720p, so Draft says the most it can cost and Sharp says it is unpriced.
 */
function qualityPrice(quality: VideoQuality, secondCents: number, shotCents: number) {
  if (quality === PRICED_VIDEO_QUALITY) {
    return `${formatCents(secondCents)} a second, ${formatCents(shotCents)}`
  }
  return quality === "360p"
    ? `up to ${formatCents(shotCents)}`
    : "no price from Google yet"
}

/** The line under Quality: what this shot costs and what the size means. */
function shotPriceLine(
  quality: VideoQuality,
  lengthSeconds: number,
  secondCents: number,
  shotCents: number
) {
  const price = `Costs about ${formatCents(shotCents)}: ${lengthSeconds} seconds at ${formatCents(secondCents)} a second.`
  if (quality === PRICED_VIDEO_QUALITY) return price
  const unpriced = `Google prices only 720p, so this counts as ${formatCents(shotCents)} against the allowance, and the bill is what Google counts.`
  return quality === "360p"
    ? `Draft is quicker and costs less than Normal. ${unpriced}`
    : `Sharp makes a bigger file and takes longer. ${unpriced}`
}

/**
 * What a shot was made with and what it cost, such as "Omni Flash, Normal
 * 720p, $0.81". One still being made says what it is expected to cost.
 */
function shotMadeWith(shot: GenerationItem) {
  const cost =
    shot.status === "ready"
      ? formatCents(shot.charged_cents || shot.expected_cents)
      : shot.charged_cents
        ? `${formatCents(shot.charged_cents)} so far`
        : shot.status === "error"
          ? "nothing charged"
          : `about ${formatCents(shot.expected_cents)}`
  return `${shot.model_name}, ${shot.quality}, ${cost}`
}

/**
 * What the shot was sent beyond the first frame, such as "Mia, 3 pictures on
 * one board, with Green wool jacket, Bright kitchen".
 */
function shotSent(shot: GenerationItem) {
  const pictures =
    shot.board_pictures > 1
      ? `${shot.board_pictures} pictures on one board`
      : shot.board_pictures === 1
        ? "1 picture"
        : "words only"
  const extras = shot.extras.length ? `, with ${shot.extras.join(", ")}` : ""
  return `${shot.actor_name}, ${pictures}${extras}`
}

/**
 * One shot: being made, failed with a reason, or ready to drag. Its direction
 * sits on top, so shots tried side by side can be told apart.
 */
function ShotRow({
  shot,
  busy,
  dragHandlers,
  onRetry,
  onDelete,
}: {
  shot: GenerationItem
  busy: boolean
  dragHandlers: DragHandlers
  onRetry: () => void
  onDelete: () => void
}) {
  const first = shot.pieces[0]?.output ?? null
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
      <p className="col-span-2 line-clamp-2 text-xs [overflow-wrap:anywhere]">
        {shot.pieces.map((piece) => piece.prompt).join(" / ")}
      </p>
      <p className="col-span-2 line-clamp-2 text-[0.625rem] text-muted-foreground">
        {shotMadeWith(shot)}
      </p>
      {shot.actor_name ? (
        <p className="col-span-2 line-clamp-2 text-[0.625rem] text-muted-foreground">
          {shotSent(shot)}
        </p>
      ) : null}
      {shot.status === "ready" && first ? (
        <button
          type="button"
          aria-label={`${shot.duration_seconds} second AI clip. Drag onto a track to add it`}
          {...dragHandlers({ kind: "shot", shot })}
          className="relative cursor-grab touch-none overflow-hidden rounded-md border bg-black"
        >
          <video
            src={first.playback_url}
            muted
            playsInline
            preload="metadata"
            className="block max-h-40 w-full object-contain"
          />
          <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] text-white tabular-nums">
            {shot.duration_seconds}s · drag
          </span>
        </button>
      ) : shot.status === "error" ? (
        <div className="grid gap-1 text-xs">
          <span className="text-destructive">
            {shot.error_message ?? "The shot could not be made."}
          </span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRetry}>
            {busy ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
            Try again
          </Button>
        </div>
      ) : (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
          {shotProgress(shot)}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Delete this shot"
        disabled={busy || shotWorking(shot)}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}

/**
 * Picks first frames for a new carousel, in the order they are ticked, and
 * its shape. Each picture fills its slide, so the edges of a picture in a
 * different shape are cut off and the middle stays.
 */
function CarouselFromFramesDialog({
  open,
  onOpenChange,
  frames,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  frames: FirstFrameItem[]
  onCreate: (frameIds: string[], format: CarouselFormat) => Promise<void>
}) {
  const [ticked, setTicked] = React.useState<string[]>([])
  const [format, setFormat] = React.useState<CarouselFormat>("4:5")
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTicked([])
  }

  function toggle(id: string) {
    setTicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 20
          ? current
          : [...current, id]
    )
  }

  async function submit() {
    if (!ticked.length) {
      showErrorToast("Tick at least one first frame.")
      return
    }
    setBusy(true)
    try {
      await onCreate(ticked, format)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Carousel from first frames</DialogTitle>
          <DialogDescription>
            One slide per first frame, in the order you tick them, up to 20.
            Each picture fills its slide, so a picture in another shape loses
            its edges and keeps its middle.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Shape</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="carousel-shape">Slide shape</Label>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as CarouselFormat)}
                >
                  <SelectTrigger id="carousel-shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAROUSEL_FORMATS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>First frames</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              {frames.map((frame) => {
                const position = ticked.indexOf(frame.id)
                return (
                  <label
                    key={frame.id}
                    className="relative grid cursor-pointer gap-1 text-xs"
                  >
                    <img
                      src={frame.image.url}
                      alt=""
                      className={cn(
                        "aspect-square w-full rounded-md border object-cover",
                        position >= 0 && "border-primary ring-2 ring-primary/30"
                      )}
                    />
                    <span className="flex items-center gap-1.5">
                      <Checkbox
                        checked={position >= 0}
                        onCheckedChange={() => toggle(frame.id)}
                        aria-label={`Use ${frame.name}`}
                      />
                      <span className="truncate">
                        {position >= 0 ? `${position + 1}. ` : ""}
                        {frame.name}
                      </span>
                    </span>
                  </label>
                )
              })}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Create carousel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
