import * as React from "react"

import { MusicIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { sceneFor, soundLabelFor } from "@/lib/pomodoro/media-pair"
import { vibeFor } from "@/lib/pomodoro/room-vibe"

/**
 * The shape every room card on `/rooms` is built from, ported from the old
 * app's room cards by value: a tall gradient banner with a LIVE VIBE pill, a
 * title row, a line of detail, and a row that ends in the card's one button.
 *
 * A room that has a theme shows its scene in the banner, with its sound named
 * at the foot, so people can pick a room by its mood. A room from before rooms
 * carried a pair keeps one of the four gradients.
 *
 * The four gradients and both motions come from the old app's stylesheet, not
 * from its classes. The keyframes are declared in theme.css beside the rest
 * of the ported look; a Tailwind arbitrary animation can name a keyframe but
 * cannot declare one.
 */

export function RoomCard({
  roomId,
  background,
  sound,
  dimmed,
  children,
}: {
  roomId: string
  /** The room's theme, `scene:<key>`; null draws a gradient. */
  background?: string | null
  /** The room's sound, `curated:<key>`; null names none. */
  sound?: string | null
  dimmed?: boolean
  children: React.ReactNode
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3.5 rounded-[20px] border bg-[var(--p-surface)] px-3 pt-3 pb-[22px]",
        dimmed && "opacity-75"
      )}
    >
      <RoomVibeBanner
        gradient={vibeFor(roomId)}
        scene={sceneFor(background ?? null)?.thumb ?? null}
        soundName={soundLabelFor(sound ?? null)}
      />
      {children}
    </article>
  )
}

function RoomVibeBanner({
  gradient,
  scene,
  soundName,
}: {
  gradient: string
  /** The scene's thumbnail name, when the room has a theme. */
  scene: string | null
  soundName: string | null
}) {
  return (
    <div
      className="relative h-[108px] overflow-hidden rounded-[14px] bg-[length:200%_200%] motion-reduce:animate-none"
      style={
        scene
          ? undefined
          : {
              backgroundImage: gradient,
              animation: "pomodoro-vibe 12s ease infinite",
            }
      }
    >
      {scene ? (
        <img
          src={`/backgrounds/thumbs-${scene}.png`}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {/* The room's own colour is behind the pill, so the bottom of the
          banner is faded into the page before any text sits on it. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(var(--p-canvas-rgb),0.55))]"
      />
      <LiveVibePill />
      {soundName ? (
        <span className="absolute bottom-2.5 left-2.5 z-[1] flex items-center gap-1.5 rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-canvas-rgb),0.5)] px-2.5 py-1 text-[11px] text-[var(--p-text)] backdrop-blur-[6px]">
          <MusicIcon className="size-3" aria-hidden="true" />
          {soundName}
        </span>
      ) : null}
    </div>
  )
}

function LiveVibePill() {
  return (
    <span className="absolute top-2.5 left-2.5 z-[1] flex items-center gap-1.5 rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-canvas-rgb),0.5)] py-1 pr-2.5 pl-2 backdrop-blur-[6px]">
      <span aria-hidden="true" className="flex h-[9px] items-end gap-[2px]">
        {[0, 0.2, 0.4].map((delay) => (
          <b
            key={delay}
            className="h-full w-[2.5px] rounded-sm bg-[var(--p-text)] motion-reduce:animate-none"
            style={{
              animation: `pomodoro-equaliser 0.8s ease-in-out ${delay}s infinite`,
            }}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--p-text)]">
        LIVE VIBE
      </span>
    </span>
  )
}

/** The card's heading row: a status dot, the room's name, and its clock. */
export function RoomCardTitle({
  name,
  status,
  tone,
}: {
  name: string
  status: React.ReactNode
  tone: "open" | "locked"
}) {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <i
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          tone === "open"
            ? "bg-[var(--p-success)]"
            : "bg-[var(--p-accent)]"
        )}
      />
      <strong className="mr-auto truncate text-base">{name}</strong>
      <span
        className={cn(
          "shrink-0 font-mono text-[11.5px]",
          tone === "open"
            ? "text-[var(--p-success)]"
            : "text-[var(--p-accent-2)]"
        )}
      >
        {status}
      </span>
    </div>
  )
}

/** The monospace line under the title, for counts and times. */
export function RoomCardDetail({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <span className="flex items-center gap-[7px] font-mono text-xs text-[var(--p-text-subtle)]">
        {children}
      </span>
    </div>
  )
}

/** The bottom row: a sentence on the left, the card's button on the right. */
export function RoomCardAction({
  note,
  children,
}: {
  note: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-3">
      <span className="mr-auto min-w-0 truncate text-[13px] text-[rgba(var(--p-text-rgb),0.6)]">
        {note}
      </span>
      {children}
    </div>
  )
}

/** What a group shows when it holds no rooms. */
export function RoomGroupEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="col-span-full m-0 rounded-[20px] border border-dashed p-10 text-center text-[var(--p-text-subtle)]">
      {children}
    </p>
  )
}

/** The group's own heading: a title, a monospace aside, and any action. */
export function RoomGroupHeading({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <h3 className="text-[22px] tracking-[-0.01em]">{title}</h3>
      <span className="font-mono text-xs text-[var(--p-text-subtle)]">
        {subtitle}
      </span>
      {children}
    </div>
  )
}
