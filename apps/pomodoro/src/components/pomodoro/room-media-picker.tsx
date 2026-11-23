import * as React from "react"
import {
  ImageIcon,
  LockIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  ShuffleIcon,
} from "lucide-react"

import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { CurrentlySelectedLabel } from "@/components/pomodoro/media-add-actions"
import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import { SoundWave } from "@/components/pomodoro/sound-wave"
import type {
  ChoiceGroup,
  RoomMediaChoice,
  RoomMediaKind,
} from "@/lib/pomodoro/room-media-choices"
import { sameSoundReference } from "@/lib/pomodoro/sound-catalog"
import type { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"

/**
 * How Host a room picks the room's sound and background: as cards with their
 * picture, not as names in a list. Tyler, 11 Oct 2026: "I'd have no idea what
 * i picked when the media is just text." See "Picking the sound and the
 * background" in `workspace/docs/rooms.md`.
 *
 * The field in the form shows the pick's picture and, for a sound, a play
 * button. Pressing it turns the window into a grid of cards (the window
 * changes in place; a second window on top would be a nested modal). A sound
 * card plays a preview when picked, on the window's own player, never the
 * header's. A background card plays its film while pointed at, or once tapped.
 */

type Preview = ReturnType<typeof usePreviewAudio>

const GROUP_HEADINGS: Record<ChoiceGroup, string> = {
  mixes: "Mixes",
  catalogue: "Catalogue",
  own: "Your uploads",
  saved: "Saved from members",
}

/** The picture a card or the field draws: a waveform, or the still(s). */
function ChoicePicture({
  kind,
  choice,
  playing,
}: {
  kind: RoomMediaKind
  choice: RoomMediaChoice
  playing: boolean
}) {
  if (kind === "sound") {
    return <SoundWave seed={choice.value} playing={playing} />
  }
  if (choice.stills.length > 1) {
    // A mix: up to four of the backgrounds it shuffles through, two by two,
    // or side by side when there are only two or three.
    return (
      <span
        className={cn(
          "grid size-full gap-px bg-border",
          choice.stills.length === 4
            ? "grid-cols-2 grid-rows-2"
            : choice.stills.length === 3
              ? "grid-cols-3"
              : "grid-cols-2"
        )}
      >
        {choice.stills.map((still) => (
          <img key={still} src={still} alt="" className="size-full object-cover" />
        ))}
      </span>
    )
  }
  return (
    <>
      {choice.stills[0] ? (
        <img src={choice.stills[0]} alt="" className="size-full object-cover" />
      ) : choice.background?.type === "media" && choice.background.mediaUrl ? (
        // A clip with no still: its first frame, never started.
        <video
          src={choice.background.mediaUrl}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
      ) : (
        <span className="grid size-full place-items-center bg-muted text-muted-foreground">
          <ImageIcon className="size-5" aria-hidden="true" />
        </span>
      )}
      {playing && choice.background ? (
        <SceneBackdrop
          background={choice.background}
          onMediaError={() => undefined}
          shading="none"
        />
      ) : null}
    </>
  )
}

/**
 * The Sound or Background field in the Host a room form: the pick's picture
 * and name, pressed to open the cards. A single sound's picture is its play
 * button, inside the field (Tyler, 11 Oct 2026: "Maybe put it inside the
 * selection"), so the host can hear the pick without opening anything.
 */
export function RoomMediaField({
  id,
  kind,
  choice,
  invalid,
  preview,
  onOpen,
  fieldRef,
}: {
  id: string
  kind: RoomMediaKind
  choice: RoomMediaChoice | null
  invalid: boolean
  preview: Preview
  onOpen: () => void
  fieldRef: React.Ref<HTMLButtonElement>
}) {
  const noun = kind === "sound" ? "Sound" : "Background"
  const sound = choice?.sound ?? null
  const playing =
    sound !== null && preview.playing && sameSoundReference(preview.previewing, sound)
  return (
    // The whole box opens the cards: the Change button stretches over it
    // (its ::after), and only the play button sits above that.
    <div
      className={cn(
        // min-w-0: a long name shortens with "…" instead of widening the form.
        "relative flex min-w-0 items-center gap-3 rounded-lg border border-input p-1.5 pr-3 transition-colors hover:bg-muted/50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/30",
        invalid &&
          "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40"
      )}
    >
      <span
        className={cn(
          "relative block aspect-video w-20 shrink-0 overflow-hidden rounded-md",
          sound && "z-[1]"
        )}
      >
        {choice ? (
          <ChoicePicture kind={kind} choice={choice} playing={playing} />
        ) : (
          <span className="grid size-full place-items-center rounded-md border border-dashed border-input text-muted-foreground">
            {kind === "sound" ? (
              <MusicIcon className="size-4" aria-hidden="true" />
            ) : (
              <ImageIcon className="size-4" aria-hidden="true" />
            )}
          </span>
        )}
        {sound ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={playing ? `Stop ${choice!.label}` : `Hear ${choice!.label}`}
                onClick={() => preview.toggle(sound)}
                className="group absolute inset-0 grid place-items-center outline-none"
              >
                <span className="grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                  {playing ? (
                    <PauseIcon className="size-3.5" aria-hidden="true" />
                  ) : (
                    <PlayIcon className="size-3.5" aria-hidden="true" />
                  )}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{playing ? "Stop" : "Hear it"}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <button
        ref={fieldRef}
        id={id}
        type="button"
        aria-invalid={invalid}
        aria-label={
          choice
            ? `${noun}: ${choice.label}. Press to change it`
            : `${noun}: none picked. Press to pick one`
        }
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">
            {choice ? choice.label : `Pick a ${kind}`}
          </span>
          {choice && !choice.detail ? null : (
            <span className="truncate text-xs text-muted-foreground">
              {choice ? choice.detail : "None picked yet"}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {choice ? "Change" : "Pick"}
        </span>
      </button>
    </div>
  )
}

/**
 * The cards, grouped: Mixes, Catalogue, Your uploads, Saved from members.
 * Pressing a card picks it, and a sound card also plays (pressed again, it
 * stops). The pick is only kept once the room is created or booked.
 */
export function RoomMediaPicker({
  kind,
  choices,
  value,
  preview,
  filesState,
  onRetryFiles,
  onPick,
  onLocked,
}: {
  kind: RoomMediaKind
  choices: RoomMediaChoice[]
  value: string
  preview: Preview
  filesState: "loading" | "failed" | "ready"
  onRetryFiles: () => void
  onPick: (value: string) => void
  onLocked: () => void
}) {
  const gridRef = React.useRef<HTMLDivElement>(null)
  // The background last pressed keeps playing after the pointer leaves, so a
  // tap on a phone, which has no pointing, still shows the film.
  const [pressed, setPressed] = React.useState("")
  const [hovered, setHovered] = React.useState("")

  // Focus lands on the current pick, or on the first card, so the keyboard
  // carries on from where the field was.
  React.useEffect(() => {
    const grid = gridRef.current
    const target =
      grid?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
      grid?.querySelector<HTMLButtonElement>("button")
    target?.focus()
  }, [])

  const groups = (["mixes", "catalogue", "own", "saved"] as const)
    .map((group) => ({ group, items: choices.filter((choice) => choice.group === group) }))
    .filter(({ items }) => items.length > 0)
  const noFiles = filesState === "ready" && !groups.some(({ group }) => group === "own" || group === "saved")

  return (
    <div ref={gridRef} className="grid gap-6">
      {preview.failed ? (
        <p role="status" className="text-sm text-muted-foreground">
          That preview could not be played. Press the card again to try again.
        </p>
      ) : null}
      {groups.map(({ group, items }) => (
        <section key={group} className="grid gap-3" aria-labelledby={`room-${kind}-${group}`}>
          <h3 id={`room-${kind}-${group}`} className="text-sm font-medium">
            {GROUP_HEADINGS[group]}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((choice) => {
              const picked = choice.value === value
              const previewing =
                choice.sound != null &&
                sameSoundReference(preview.previewing, choice.sound)
              const soundPlaying = previewing && preview.playing
              const filmPlaying =
                kind === "background" &&
                !choice.locked &&
                (hovered === choice.value || pressed === choice.value)
              return (
                <button
                  key={choice.value}
                  type="button"
                  data-choice={choice.value}
                  aria-pressed={choice.locked ? undefined : picked}
                  aria-label={
                    choice.locked
                      ? `${choice.label}, a Pro ${kind}. See the plans`
                      : kind === "sound" && choice.sound
                        ? soundPlaying
                          ? `${choice.label}, picked and playing. Press to stop it`
                          : `Pick ${choice.label} and hear it`
                        : `Pick ${choice.label}`
                  }
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setHovered(choice.value)
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === "mouse") setHovered("")
                  }}
                  onClick={() => {
                    if (choice.locked) {
                      onLocked()
                      return
                    }
                    onPick(choice.value)
                    setPressed(choice.value)
                    if (choice.sound) preview.toggle(choice.sound)
                    // A mix has no one sound to play; whatever played stops.
                    else if (kind === "sound") preview.stop()
                  }}
                  className={cn(
                    // Focus is an outline, so it still shows on the picked
                    // card's ring.
                    "group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors outline-none hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    picked && "ring-2 ring-[var(--p-accent)]"
                  )}
                >
                  <span className="relative block aspect-video overflow-hidden">
                    <span className={cn("block size-full", choice.locked && "opacity-40 grayscale")}>
                      <ChoicePicture
                        kind={kind}
                        choice={choice}
                        playing={kind === "sound" ? soundPlaying : filmPlaying}
                      />
                    </span>
                    {picked ? <CurrentlySelectedLabel /> : null}
                    {choice.locked || kind === "sound" ? (
                      <span className="absolute inset-0 grid place-items-center">
                        <span
                          className={cn(
                            "grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm",
                            // A card not playing shows its button only on
                            // hover or keyboard focus.
                            !choice.locked &&
                              choice.sound &&
                              !previewing &&
                              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          )}
                        >
                          {choice.locked ? (
                            <LockIcon className="size-4" aria-hidden="true" />
                          ) : !choice.sound ? (
                            <ShuffleIcon className="size-4" aria-hidden="true" />
                          ) : soundPlaying ? (
                            <PauseIcon className="size-4" aria-hidden="true" />
                          ) : (
                            <PlayIcon className="size-4" aria-hidden="true" />
                          )}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <strong className="truncate text-sm font-semibold" title={choice.label}>
                        {choice.label}
                      </strong>
                      {choice.pro ? (
                        <small className="shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--p-accent-2)]">
                          Pro
                        </small>
                      ) : null}
                    </span>
                    {choice.detail ? (
                      <small className="truncate text-xs text-muted-foreground">
                        {choice.detail}
                      </small>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {filesState === "loading" ? (
        <LoadingRow label="Loading your uploads and saved files…" />
      ) : filesState === "failed" ? (
        <ErrorRow
          message="Your uploads and saved files could not be loaded."
          onRetry={onRetryFiles}
        />
      ) : noFiles ? (
        <p className="text-sm text-muted-foreground">
          {kind === "sound" ? "Sounds" : "Backgrounds"} you upload and share, or save
          from members, show here too.
        </p>
      ) : null}
    </div>
  )
}
