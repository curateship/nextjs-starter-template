import * as React from "react"

import type { BackgroundReference } from "@/lib/pomodoro/background-catalog"
import { usePrefersReducedMotion } from "@/lib/pomodoro/use-reduced-motion"

/** The lofi scene is the only built-in one that is a film rather than a photo. */
const LOFI_VIDEO = "/backgrounds/uploads-265816_small.mp4"
const LOFI_STILL = "/backgrounds/thumbs-lofi_girl.png"

const MEDIA_CLASS = "absolute inset-0 size-full object-cover"

/**
 * The chosen scene, drawn behind whatever sits on top of it.
 *
 * Two screens draw it. The product shell draws it as a 720px hero at the top
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
 */
export function SceneBackdrop({
  background,
  onMediaError,
  shading,
}: {
  background: BackgroundReference
  onMediaError: () => void
  shading: "hero" | "zen"
}) {
  const stillOnly = usePrefersReducedMotion()

  // The address of a film that would not load. Held rather than counted, so a
  // second scene chosen afterwards is tried properly instead of inheriting the
  // first one's failure.
  const [brokenVideo, setBrokenVideo] = React.useState<string | null>(null)

  return (
    <>
      {background.type === "scene" ? (
        background.key === "lofi" ? (
          // The lofi film's own first frame ships as a file, so falling back to
          // it is the scene held still rather than a black rectangle. Asking
          // the background store for the default would do nothing at all here:
          // lofi *is* the default, and the store ignores a fallback to the
          // scene already showing.
          stillOnly || brokenVideo === LOFI_VIDEO ? (
            <img
              className={MEDIA_CLASS}
              src={LOFI_STILL}
              alt=""
              onError={onMediaError}
            />
          ) : (
            <SceneVideo
              src={LOFI_VIDEO}
              poster={LOFI_STILL}
              still={false}
              onFailed={() => setBrokenVideo(LOFI_VIDEO)}
            />
          )
        ) : (
          <img
            className={MEDIA_CLASS}
            src={`/backgrounds/thumbs-${background.key}.png`}
            alt=""
            onError={onMediaError}
          />
        )
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
          className={MEDIA_CLASS}
          src={background.mediaUrl}
          alt=""
          onError={onMediaError}
        />
      )}
      {shading === "hero" ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(var(--p-canvas-rgb),.75) 0%, rgba(var(--p-canvas-rgb),.08) 22%, rgba(var(--p-canvas-rgb),0) 55%, rgba(var(--p-canvas-rgb),.55) 88%, var(--p-canvas) 100%)",
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
