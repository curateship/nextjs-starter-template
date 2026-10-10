import * as React from "react"

import { MusicIcon } from "lucide-react"

import { PersonAvatar } from "@/components/pomodoro/initials-avatar"
import { cn } from "@/lib/utils"
import { sceneFor, soundLabelFor } from "@/lib/pomodoro/media-pair"
import { useMediaCatalog } from "@/lib/pomodoro/room-media-store"
import { usePrefersReducedMotion } from "@/lib/pomodoro/use-reduced-motion"
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
  const catalog = useMediaCatalog()
  return (
    <article
      className={cn(
        "flex flex-col gap-3.5 rounded-[20px] border bg-[var(--p-surface)] px-3 pt-3 pb-[22px]",
        dimmed && "opacity-75"
      )}
    >
      <RoomVibeBanner
        gradient={vibeFor(roomId)}
        scene={sceneFor(catalog, background ?? null)?.stillUrl ?? null}
        soundName={soundLabelFor(catalog, sound ?? null)}
      />
      {children}
    </article>
  )
}

function RoomVibeBanner({
  gradient,
  scene,
  video = null,
  playing = false,
  soundName,
  tall = false,
}: {
  gradient: string
  /** The scene's still, when the room has a theme. */
  scene: string | null
  /** The scene's film, played over the still while `playing`. */
  video?: string | null
  playing?: boolean
  soundName: string | null
  /** The Open to join card: a taller picture, the sound named top right. */
  tall?: boolean
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[length:200%_200%] motion-reduce:animate-none",
        // The tall card's picture runs edge to edge, cut by the card's own
        // corners; the short one sits inset with corners of its own.
        tall ? "h-48" : "h-[108px] rounded-[14px]"
      )}
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
          src={scene}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {/* Only while hovered, so a page of cards loads no films until one is
          pointed at. */}
      {playing && video ? (
        <video
          src={video}
          poster={scene ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {/* The room's own colour is behind the pill, so the bottom of the
          banner is faded into the page before any text sits on it. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0",
          // The tall card's name sits over the foot of the picture, so the
          // picture fades all the way into the card behind it.
          tall
            ? "bg-[linear-gradient(180deg,transparent_50%,var(--p-surface))]"
            : "bg-[linear-gradient(180deg,transparent_45%,rgba(var(--p-canvas-rgb),0.55))]"
        )}
      />
      <LiveVibePill tall={tall} />
      {soundName ? (
        <span
          className={cn(
            "absolute z-[1] flex items-center gap-1.5",
            tall ? "top-4 right-4" : "bottom-2.5 left-2.5",
            " rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-canvas-rgb),0.5)] px-2.5 py-1 text-[11px] text-[var(--p-text)] backdrop-blur-[6px]"
          )}
        >
          <MusicIcon className="size-3" aria-hidden="true" />
          {soundName}
        </span>
      ) : null}
    </div>
  )
}

function LiveVibePill({ tall }: { tall: boolean }) {
  return (
    <span
      className={cn(
        "absolute z-[1] flex items-center gap-1.5 rounded-full",
        // Clear of the card's own 24px corner when the picture runs to it.
        tall ? "top-4 left-4" : "top-2.5 left-2.5",
        "border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-canvas-rgb),0.5)] py-1 pr-2.5 pl-2 backdrop-blur-[6px]"
      )}
    >
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

/**
 * The group's own heading: a small capitals title on the left, a monospace
 * aside on the right, and any action after it.
 */
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
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h3 className="mr-auto font-mono text-xs font-normal uppercase tracking-[0.2em]">
        {title}
      </h3>
      <span className="font-mono text-xs text-[var(--p-text-subtle)]">
        {subtitle}
      </span>
      {children}
    </div>
  )
}

/**
 * A room in Open to join, drawn to Tyler's design of 7 Oct 2026: a tall
 * picture running edge to edge with the LIVE VIBE pill, the host's initials overlapping its foot
 * beside the room's name, the room's state in colour, the people in it, and
 * the next focus beside a black Join pill.
 *
 * The small circles are the people in it: their photo, or their initials
 * when they have none. Tyler, 9 Oct 2026: "this need to show real avatars"
 * and "The cards show the avatar". Until then the list carried a count and
 * no names, a rule kept since a real leak; Tyler chose faces on the cards.
 *
 * A room counting down shows "starting in 1:23" where a waiting room says
 * "waiting to start".
 */
export function OpenRoomCard({
  roomId,
  background,
  sound,
  name,
  hostName,
  hostAvatarUrl,
  people,
  phase,
  phaseEndsAt,
  startingAt,
  memberCount,
  nextFocusMinutes,
  joinButton,
  problem,
  featured = false,
  cardLink,
}: {
  roomId: string
  background: string | null
  sound: string | null
  name: string
  hostName: string
  hostAvatarUrl: string | null
  /** Up to three people besides the host, first in first. */
  people: readonly { name: string; avatarUrl: string | null }[]
  phase: string
  phaseEndsAt: Date | string | null
  /** When a "Starting in" countdown ends, or null. */
  startingAt: Date | string | null
  memberCount: number
  nextFocusMinutes: number
  joinButton: React.ReactNode
  problem?: React.ReactNode
  /** An admin featured it, so it sits first with a label (admin task 04). */
  featured?: boolean
  /**
   * A link laid over the whole card, so a press anywhere on it follows it:
   * the login page for a logged-out visitor. `joinButton` is then only drawn.
   */
  cardLink?: React.ReactNode
}) {
  const onBreak = phase === "short" || phase === "long"
  const catalog = useMediaCatalog()
  const theme = sceneFor(catalog, background)
  // Tyler, 9 Oct 2026: "hovering over the card should play the clip", the
  // way the theme cards on Backgrounds do. Only a mouse hovers, and never
  // with reduced motion, so no film is even loaded then.
  const [hovered, setHovered] = React.useState(false)
  const reducedMotion = usePrefersReducedMotion()
  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-[24px] border bg-[var(--p-surface)] pb-6"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <RoomVibeBanner
        gradient={vibeFor(roomId)}
        scene={theme?.stillUrl ?? null}
        video={theme?.videoUrl ?? null}
        playing={hovered && !reducedMotion}
        soundName={soundLabelFor(catalog, sound)}
        tall
      />
      <div className="relative z-[1] -mt-7 flex items-end gap-3 px-6">
        <span className="relative shrink-0">
          <PersonAvatar
            name={hostName}
            avatarUrl={hostAvatarUrl}
            className="size-12 text-base ring-4 ring-[var(--p-surface)]"
          />
          <i
            aria-hidden="true"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-[var(--p-surface)]",
              onBreak ? "bg-amber-400" : "bg-[var(--p-success)]"
            )}
          />
        </span>
        <div className="min-w-0 pb-1">
          {featured ? (
            <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--p-accent-2)]">
              Featured
            </span>
          ) : null}
          <h4 className="truncate text-2xl font-semibold tracking-tight">{name}</h4>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4 px-6">
        <p
          className={cn(
            "font-mono text-sm",
            onBreak ? "text-amber-400" : "text-[var(--p-success)]"
          )}
        >
          {onBreak ? (
            <>
              on break · <BreakClock endsAt={phaseEndsAt} />
            </>
          ) : startingAt ? (
            <>
              starting in <BreakClock endsAt={startingAt} />
            </>
          ) : (
            "waiting to start"
          )}
        </p>
        <p className="flex items-center gap-3 font-mono text-sm text-[var(--p-text-subtle)]">
          {people.length ? (
            <span aria-hidden="true" className="flex">
              {people.map((person, index) => (
                <PersonAvatar
                  key={`${person.name}-${index}`}
                  name={person.name}
                  avatarUrl={person.avatarUrl}
                  className="-ml-1.5 size-6 border-2 border-[var(--p-surface)] text-[9px] first:ml-0"
                />
              ))}
            </span>
          ) : null}
          {memberCount} focusing
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[15px] text-[rgba(var(--p-text-rgb),0.6)]">
            Next: {nextFocusMinutes} min focus
          </span>
          {joinButton}
        </div>
        {problem}
      </div>
      {cardLink}
    </article>
  )
}

/**
 * "3:12" left on the break, counted down every second against the end time
 * the list arrived with. Drawn only in the browser, because the seconds depend
 * on the reader's clock.
 */
function BreakClock({ endsAt }: { endsAt: Date | string | null }) {
  const [left, setLeft] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!endsAt) return
    const end = new Date(endsAt).getTime()
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [endsAt])
  if (left === null) return null
  return (
    <span className="tabular-nums">
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  )
}
