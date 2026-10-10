import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  HeartIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  getSharedMediaErrorMessage,
  setSharedMediaSaved,
} from "@/lib/api/pomodoro/shared-media"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  creditLabel,
  sharedBackground,
  sharedFilePath,
  sharedSound,
  type MediaCredit,
  type SharedMediaItem,
} from "@/lib/pomodoro/shared-media"
import { showErrorToast } from "@/lib/toast/error-toast"
import { MediaAddMenu } from "@/components/pomodoro/media-add-actions"
import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import { SoundWave } from "@/components/pomodoro/sound-wave"

/**
 * One file somebody shared, drawn like the catalogue's cards beside it: a
 * sound like a Sounds card, a picture or clip like a Theme card (task 03).
 * Under the name, the credit and how many people use it; beside it, the
 * heart that saves somebody else's file for later. On the picture's corner,
 * the "+" that adds it to a room and a link to its own page, which holds
 * Report (Tyler, 10 Oct 2026).
 */
export function SharedMediaCard({
  item,
  playing = false,
  onPlay,
  onSavedChange,
}: {
  item: SharedMediaItem
  /** A sound being previewed shows Pause. */
  playing?: boolean
  /** A sound's click; a clip plays on hover by itself. */
  onPlay?: () => void
  onSavedChange?: (saved: boolean) => void
}) {
  const sound = item.purpose === "sound"
  const [hovered, setHovered] = React.useState(false)
  const [tapped, setTapped] = React.useState(false)
  const filmPlaying = !sound && (hovered || tapped)
  const label = item.name

  return (
    <Card
      className={cn(
        // A size container, so the "+" can be placed from the picture.
        "@container relative gap-0 overflow-hidden p-0",
        sound && "rounded-[18px]"
      )}
      onPointerEnter={(event) => {
        if (!sound && event.pointerType === "mouse") setHovered(true)
      }}
      onPointerLeave={(event) => {
        if (sound || event.pointerType !== "mouse") return
        setHovered(false)
        setTapped(false)
      }}
    >
      <button
        type="button"
        className="group w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        aria-label={
          sound
            ? playing
              ? `Stop the ${label} preview`
              : `Preview ${label}`
            : `Play the ${label} background`
        }
        aria-pressed={sound ? playing : filmPlaying}
        onClick={() => {
          if (sound) onPlay?.()
          else setTapped((current) => !current)
        }}
      >
        <span
          className={cn(
            "relative block bg-muted",
            sound ? "aspect-[8/5]" : "aspect-video"
          )}
        >
          {sound ? (
            <SoundWave seed={item.mediaId} playing={playing} />
          ) : (
            <SharedPicture item={item} playing={filmPlaying} />
          )}
          {sound ? (
            <span className="absolute inset-0 grid place-items-center">
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm",
                  !playing &&
                    "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                )}
              >
                {playing ? (
                  <PauseIcon className="size-5" aria-hidden="true" />
                ) : (
                  <PlayIcon className="size-5" aria-hidden="true" />
                )}
              </span>
            </span>
          ) : null}
        </span>
        <CardContent
          className={cn(
            "flex flex-col pr-14",
            sound ? "gap-1 py-4 pl-[18px]" : "gap-0.5 py-3 pl-3"
          )}
        >
          <strong
            className={cn("truncate", sound ? "text-base font-semibold" : "text-sm")}
            title={label}
          >
            {label}
          </strong>
          <small
            className={cn(
              "truncate text-muted-foreground",
              sound ? "text-sm" : "text-xs"
            )}
          >
            {item.own ? "Shared by you" : creditLabel(item.credit)}
            {item.usedBy !== null ? ` · Used by ${item.usedBy} people` : ""}
          </small>
        </CardContent>
      </button>
      {item.own ? null : (
        <div
          // Level with the name, placed from the picture the way the upload
          // cards place theirs, so a stretched card keeps it in line.
          className={cn(
            "absolute right-3",
            sound ? "top-[calc(62.5cqw+12px)]" : "top-[calc(56.25cqw+6px)]"
          )}
        >
          <SaveHeart item={item} onSavedChange={onSavedChange} />
        </div>
      )}
      {/* Tyler, 10 Oct 2026, pointing at the picture's corner: "There
          should be 2 icons here, one to add to personal room and another is
          link to the page". */}
      <div className="absolute top-2 right-2 flex gap-1">
        <MediaAddMenu item={sharedAddItem(item)} className={cornerButton} />
        {item.credit.handle ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className={cornerButton}
          >
            <a
              href={sharedFilePath(item.credit.handle, item.mediaId)}
              aria-label={`Open the page for ${item.name}`}
              title="Open its page"
            >
              <SquareArrowOutUpRightIcon className="size-4" aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

const cornerButton =
  "rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 hover:text-white"

/** A picture, or a clip's still that turns into the film while it plays. */
function SharedPicture({
  item,
  playing,
}: {
  item: SharedMediaItem
  playing: boolean
}) {
  if (item.kind === "image")
    return <img src={item.url} alt="" className="size-full object-cover" />
  return (
    <>
      {item.stillUrl ? (
        <img src={item.stillUrl} alt="" className="size-full object-cover" />
      ) : (
        <video
          src={`${item.url}#t=0.1`}
          className="size-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      )}
      {playing ? (
        <SceneBackdrop
          background={sharedBackground(item)}
          onMediaError={() => undefined}
          shading="none"
        />
      ) : null}
    </>
  )
}

/** The heart: kept for later in the member's Saved list. Signed in only. */
function SaveHeart({
  item,
  onSavedChange,
}: {
  item: SharedMediaItem
  onSavedChange?: (saved: boolean) => void
}) {
  const { authenticated } = useProductAuth()
  const [saved, setSaved] = React.useState(item.saved)
  const [busy, setBusy] = React.useState(false)
  if (!authenticated) return null

  const toggle = async () => {
    const next = !saved
    setBusy(true)
    setSaved(next)
    try {
      await setSharedMediaSaved(item.mediaId, next)
      onSavedChange?.(next)
    } catch (cause) {
      setSaved(!next)
      showErrorToast(getSharedMediaErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="rounded-full"
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.name} from Saved` : `Save ${item.name}`}
      title={saved ? "Saved" : "Save for later"}
      onClick={() => void toggle()}
    >
      {busy ? (
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <HeartIcon
          className={cn("size-4", saved && "fill-current text-[var(--p-accent)]")}
          aria-hidden="true"
        />
      )}
    </Button>
  )
}

/** "by @sarah", linked to her page, or "by a member" when it is off. */
export function CreditLink({
  credit,
  className,
}: {
  credit: MediaCredit
  className?: string
}) {
  if (!credit.handle)
    return <span className={className}>{creditLabel(credit)}</span>
  return (
    <Link
      to="/u/$handle"
      params={{ handle: credit.handle }}
      className={cn("underline-offset-2 hover:underline", className)}
    >
      {creditLabel(credit)}
    </Link>
  )
}

function sharedAddItem(item: SharedMediaItem) {
  // A host may put their own shared file, or one they saved, in their room.
  const allowRoom = item.own || item.saved
  return item.purpose === "sound"
    ? { kind: "sound" as const, reference: sharedSound(item), label: item.name, allowRoom }
    : {
        kind: "background" as const,
        reference: sharedBackground(item),
        label: item.name,
        allowRoom,
      }
}
