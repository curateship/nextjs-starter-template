import * as React from "react"

import {
  DEFAULT_SCENE_FILES,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { useBackdropLook } from "@/lib/pomodoro/backdrop-look"
import { usePrefersReducedMotion } from "@/lib/pomodoro/use-reduced-motion"
import { cn } from "@/lib/utils"

const MEDIA_CLASS = "absolute inset-0 size-full object-cover"

/** A picture's drift: 60 seconds of slow zoom one way, then back. */
const DRIFT_CLASS =
  "origin-center animate-[pomodoro-drift_60s_ease-in-out_infinite_alternate] motion-reduce:animate-none"

/**
 * The chosen scene, drawn behind whatever sits on top of it.
 *
 * Two screens draw it. The product shell draws it as an 860px hero at the top
 * of every member page, shaded the way the old app shaded it. Zen mode draws
 * the same scene across the whole viewport, and needs a heavier, even wash
 * instead, because there the ring sits over the middle of the picture rather
 * than over the part the hero gradient has already faded.
 *
 * The media itself is identical in both, so entering zen mode never swaps the
 * picture, restarts a video, or refetches an upload.
 *
 * Nobody who has asked their computer for less movement gets a looping film
 * here. They get the same scene held still, and if they change their mind the
 * picture starts or stops without a reload.
 *
 * Two of the member's own settings shape it (`backdrop-look.ts`): a picture
 * they uploaded drifts very slowly unless they switched that off, and the dim
 * draws a dark layer over the scene, under the shading, so the timer's white
 * numbers stay readable over a bright photo. The dim is left off the
 * Backgrounds page's card previews, which show a scene as it is.
 */
export function SceneBackdrop({
  background,
  onMediaError,
  shading,
}: {
  background: BackgroundReference
  onMediaError: () => void
  /** "none" is the Backgrounds page's preview, which shows the picture as it is. */
  shading: "hero" | "zen" | "none"
}) {
  const stillOnly = usePrefersReducedMotion()
  const look = useBackdropLook()

  // The address of a film that would not load. Held rather than counted, so a
  // second scene chosen afterwards is tried properly instead of inheriting the
  // first one's failure.
  const [brokenVideo, setBrokenVideo] = React.useState<string | null>(null)

  return (
    <>
      {background.type === "scene" ? (
        <CatalogScene
          // A scene read before its files were filled in can only be the
          // default, which always has its own.
          stillUrl={background.stillUrl ?? DEFAULT_SCENE_FILES.stillUrl}
          videoUrl={
            background.stillUrl
              ? (background.videoUrl ?? null)
              : DEFAULT_SCENE_FILES.videoUrl
          }
          stillOnly={stillOnly}
          brokenVideo={brokenVideo}
          onVideoFailed={setBrokenVideo}
          onMediaError={onMediaError}
        />
      ) : background.mediaKind === "video" ? (
        // An upload has no separate still to show, so the film itself is held
        // on its first frame: loaded far enough to paint, never started. The
        // key changes with the setting so the element is rebuilt, because an
        // already-playing video does not stop just because `autoPlay` turned
        // false.
        <SceneVideo
          key={`${background.mediaId}:${stillOnly ? "still" : "playing"}`}
          src={background.mediaUrl}
          still={stillOnly}
          onFailed={onMediaError}
        />
      ) : (
        <img
          key={background.mediaId}
          // Only a picture of the member's own drifts: someone else's shared
          // picture carries a credit and stays still, as the doc says.
          className={cn(MEDIA_CLASS, look.drift && !stillOnly && !background.credit && DRIFT_CLASS)}
          src={background.mediaUrl}
          alt=""
          onError={onMediaError}
        />
      )}
      {shading !== "none" && look.dim > 0 ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black"
          style={{ opacity: look.dim / 100 }}
        />
      ) : null}
      {shading === "none" ? null : shading === "hero" ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                // The top stops sit at the same pixels as on the old 720px
                // hero (158px and 396px); the fade to the canvas then runs
                // down to 860px, where it used to end at 720px.
                "linear-gradient(180deg, rgba(var(--p-canvas-rgb),.75) 0%, rgba(var(--p-canvas-rgb),.08) 18.4%, rgba(var(--p-canvas-rgb),0) 46%, rgba(var(--p-canvas-rgb),.45) 70%, rgba(var(--p-canvas-rgb),.8) 87%, var(--p-canvas) 100%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, var(--p-canvas) 0%, rgba(var(--p-canvas-rgb),0) 14%, rgba(var(--p-canvas-rgb),0) 86%, var(--p-canvas) 100%)",
              boxShadow: "inset 0 0 90px 30px var(--p-canvas)",
            }}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 46%, rgba(var(--p-canvas-rgb),.82) 0%, rgba(var(--p-canvas-rgb),.88) 45%, rgba(var(--p-canvas-rgb),.96) 100%)",
          }}
        />
      )}
    </>
  )
}

/**
 * A film behind the timer, and the one place that notices it did not load.
 *
 * `onError` alone missed the common case. The server sends the tag, the browser
 * gives up on the file during hydration, and the error is over before React has
 * a listener on the element, so the page sat on a dead video for ever. The
 * element keeps its own `error`, so the ref asks it once on the way in, which
 * catches both the early failure and, through `onError`, a later one.
 */
function SceneVideo({
  src,
  poster,
  still,
  onFailed,
}: {
  src: string | undefined
  poster?: string
  /** Hold the first frame instead of playing it. */
  still: boolean
  onFailed: () => void
}) {
  return (
    <video
      className={MEDIA_CLASS}
      src={src}
      poster={poster}
      autoPlay={!still}
      loop={!still}
      preload={still ? "metadata" : undefined}
      muted
      playsInline
      onError={onFailed}
      ref={(element) => {
        if (element?.error) onFailed()
      }}
    />
  )
}

/**
 * A catalogue scene: its film looping behind the page, or its still. A film
 * that will not play, or anybody who asked for less movement, gets the still,
 * which every theme has, so the hero is a picture rather than a black
 * rectangle. Only a still that will not load asks the store to fall back.
 */
function CatalogScene({
  stillUrl,
  videoUrl,
  stillOnly,
  brokenVideo,
  onVideoFailed,
  onMediaError,
}: {
  stillUrl: string
  videoUrl: string | null
  stillOnly: boolean
  brokenVideo: string | null
  onVideoFailed: (src: string) => void
  onMediaError: () => void
}) {
  if (!videoUrl || stillOnly || brokenVideo === videoUrl) {
    return (
      <img
        key={stillUrl}
        className={MEDIA_CLASS}
        src={stillUrl}
        alt=""
        onError={onMediaError}
      />
    )
  }
  return (
    <SceneVideo
      key={videoUrl}
      src={videoUrl}
      poster={stillUrl}
      still={false}
      onFailed={() => onVideoFailed(videoUrl)}
    />
  )
}
