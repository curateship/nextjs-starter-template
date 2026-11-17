import * as React from "react"
import { PlusIcon } from "lucide-react"

import { MediaPicker } from "@/components/media/media-picker"
import { PickRow } from "@/components/shared/notes/pick-rows"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * A project's optional avatar, before its name in the project page's header
 * (Tyler, 17 Nov 2026: "I want to be able to add an optional avatar here",
 * then "Header only and this is only for project. I want to be able to use
 * images, svg (like the pomodoro animattion logo) or even mp4").
 *
 * The media library hands back an address only, so the file's ending says
 * which kind it is: a video plays by itself, silent and looping, as a moving
 * logo would; anything else is a picture.
 */
const VIDEO_ENDING = /\.(mp4|m4v|mov|webm)(?:$|[?#])/i

function isVideoAvatar(url: string) {
  return VIDEO_ENDING.test(url)
}

/**
 * The avatar itself, filling the box it is put in. A file that stops loading,
 * say one deleted from the media library, draws nothing rather than a broken
 * picture, as the cover does.
 */
export function ProjectAvatar({ url, className }: { url: string; className?: string }) {
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null)
  // The server draws the page, so a file can fail before React listens for
  // its error; this catches one that already has.
  const failedBeforeHydration = React.useCallback(
    (node: HTMLImageElement | HTMLVideoElement | null) => {
      if (!node) return
      const failed =
        node instanceof HTMLImageElement
          ? node.complete && node.naturalWidth === 0
          : node.error !== null || node.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
      if (failed) setBrokenUrl(url)
    },
    [url]
  )
  if (brokenUrl === url) return null
  const look = cn("size-full object-cover", className)
  const broke = () => setBrokenUrl(url)
  if (isVideoAvatar(url)) {
    return (
      <video
        ref={failedBeforeHydration}
        src={url}
        className={look}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        onError={broke}
      />
    )
  }
  return <img ref={failedBeforeHydration} src={url} alt="" className={look} onError={broke} />
}

/**
 * The ⋮'s Avatar row, under Page beside Cover photo: None, the avatar picked,
 * and + for the media library. Every pick saves at once.
 */
export function AvatarRow({
  url,
  busy,
  onSet,
}: {
  url: string | null
  busy: boolean
  /** "" takes the avatar away. */
  onSet: (url: string) => void
}) {
  const [picking, setPicking] = React.useState(false)
  const value = !url ? "None" : isVideoAvatar(url) ? "Video" : "Picture"
  return (
    <PickRow label="Avatar" value={value} empty={!url} disabled={busy}>
      <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Avatar">
        <AvatarTile label="None" picked={!url} disabled={busy} onPick={() => url && onSet("")}>
          <span className="text-xs text-muted-foreground">None</span>
        </AvatarTile>
        {url ? (
          <AvatarTile label={value} picked disabled={busy} onPick={() => {}}>
            <ProjectAvatar url={url} className="absolute inset-0" />
          </AvatarTile>
        ) : null}
        <button
          type="button"
          aria-label={url ? "Pick another avatar" : "Add an avatar"}
          disabled={busy}
          onClick={() => setPicking(true)}
          className={cn(
            "flex aspect-square items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted/50 disabled:opacity-50",
            focusRing
          )}
        >
          <PlusIcon className="size-5" />
        </button>
      </div>
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        currentMediaUrl={url ?? undefined}
        defaultCropAspect="square"
        onSelectMedia={(next) => {
          setPicking(false)
          if (next !== url) onSet(next)
        }}
      />
    </PickRow>
  )
}

/** One square tile, ringed when picked, as the Cover photo row draws them. */
function AvatarTile({
  label,
  picked,
  disabled,
  onPick,
  children,
}: {
  label: string
  picked: boolean
  disabled: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={picked}
      aria-label={label}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/40 disabled:opacity-50",
        picked && "border-transparent ring-[3px] ring-foreground ring-offset-2 ring-offset-popover",
        focusRing
      )}
    >
      {children}
    </button>
  )
}
