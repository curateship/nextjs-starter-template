import type { BackgroundReference } from "@/lib/pomodoro/background-catalog"

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
  return (
    <>
      {background.type === "scene" ? (
        background.key === "lofi" ? (
          <video
            className="absolute inset-0 size-full object-cover"
            src="/backgrounds/uploads-265816_small.mp4"
            poster="/backgrounds/thumbs-lofi_girl.png"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img
            className="absolute inset-0 size-full object-cover"
            src={`/backgrounds/thumbs-${background.key}.png`}
            alt=""
            onError={onMediaError}
          />
        )
      ) : background.mediaKind === "video" ? (
        <video
          key={background.mediaId}
          className="absolute inset-0 size-full object-cover"
          src={background.mediaUrl}
          autoPlay
          muted
          loop
          playsInline
          onError={onMediaError}
        />
      ) : (
        <img
          key={background.mediaId}
          className="absolute inset-0 size-full object-cover"
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
