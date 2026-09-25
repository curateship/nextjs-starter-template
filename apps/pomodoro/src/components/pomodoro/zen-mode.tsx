import * as React from "react"
import { createPortal } from "react-dom"
import { MinimizeIcon } from "lucide-react"

import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import { cn } from "@/lib/utils"
import { useBackgroundSelection } from "@/lib/pomodoro/background-store"
import { MODE_LABELS } from "@/lib/pomodoro/timer"
import type { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

type PomodoroApi = ReturnType<typeof usePomodoro>

const RING_RADIUS = 168
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** How long the leave control and the hint stay up after the mouse stops. */
const CHROME_IDLE_MS = 2600

/**
 * Zen mode: the whole screen holding two facts, the time left and what you
 * are doing.
 *
 * It draws nothing the timer does not need. The ring, the phase and the task
 * name are the resting screen; the leave control and the one-line hint fade
 * out a couple of seconds after the pointer stops and come back on the next
 * move, press or focus, so the controls exist without sitting there inviting
 * a fiddle.
 *
 * Nothing here owns the countdown. The timer is a module-level engine
 * (use-pomodoro.ts) that ticks, writes its session rows and fires the
 * completion chime whether or not any screen is drawn, so entering and
 * leaving zen mode cannot disturb a running session and the chime still
 * fires inside it. This component only reads the engine and calls the same
 * toggle the dashboard's Start button calls.
 *
 * Fullscreen is asked for, never required. A browser that refuses it (an
 * iframe without the allowfullscreen permission, or a user gesture the
 * browser did not accept) still gets the same overlay across the viewport.
 */
export function ZenMode({
  pomodoro,
  onLeave,
}: {
  pomodoro: PomodoroApi
  onLeave: () => void
}) {
  const { background, fallBackToDefault } = useBackgroundSelection()
  const [pointerAwake, setPointerAwake] = React.useState(true)
  const [chromeFocused, setChromeFocused] = React.useState(false)
  const overlay = React.useRef<HTMLDivElement>(null)
  const leaveButton = React.useRef<HTMLButtonElement>(null)
  // Held in a ref so the leave path can tell our own exitFullscreen apart
  // from the browser's Escape, which fires the same fullscreenchange event.
  const leaving = React.useRef(false)
  // True only while this component asked for fullscreen, so leaving never
  // drops a fullscreen the member had already set up with F11.
  const ownsFullscreen = React.useRef(false)

  // A focused control is never hidden, however long the pointer has rested.
  const chromeShown = pointerAwake || chromeFocused

  const minutes = Math.floor(pomodoro.remainingSeconds / 60)
  const seconds = pomodoro.remainingSeconds % 60
  const totalSeconds = pomodoro.timer.durationMinutes * 60
  const dashOffset =
    RING_CIRCUMFERENCE * (1 - pomodoro.remainingSeconds / totalSeconds)
  const phase = MODE_LABELS[pomodoro.timer.mode]
  const taskName =
    pomodoro.timer.mode === "focus" ? (pomodoro.selectedTask?.title ?? "") : ""

  // One leave path for every way out: the control, Escape, and the browser
  // dropping fullscreen on its own.
  const leave = React.useCallback(() => {
    leaving.current = true
    if (ownsFullscreen.current && document.fullscreenElement) {
      ownsFullscreen.current = false
      void document.exitFullscreen().catch(() => undefined)
    }
    onLeave()
  }, [onLeave])

  React.useEffect(() => {
    const root = document.documentElement
    // Refusal is fine: the overlay covers the viewport either way. A member
    // who was already in fullscreen keeps the one they set up, and leaving
    // zen mode then leaves it alone.
    if (!document.fullscreenElement)
      void root
        .requestFullscreen?.()
        .then(() => {
          ownsFullscreen.current = true
        })
        .catch(() => undefined)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    // aria-modal says the rest of the page is out of reach, so make that
    // true. Every other child of <body> goes inert, which takes the shell's
    // sidebar and header out of the tab order and out of the screen reader's
    // reach for as long as zen mode is up.
    const inerted: HTMLElement[] = []
    for (const node of Array.from(document.body.children)) {
      if (node === overlay.current || !(node instanceof HTMLElement)) continue
      if (node.inert) continue
      node.inert = true
      inerted.push(node)
    }
    leaveButton.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        leave()
      }
    }
    // Leaving fullscreen by any route the page did not start — Escape in
    // Chrome swallows the keydown, F11, the browser's own exit button — is
    // the same instruction as pressing the leave control.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !leaving.current) leave()
    }
    window.addEventListener("keydown", onKeyDown)
    document.addEventListener("fullscreenchange", onFullscreenChange)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      document.body.style.overflow = previousOverflow
      for (const node of inerted) node.inert = false
      if (ownsFullscreen.current && document.fullscreenElement) {
        ownsFullscreen.current = false
        void document.exitFullscreen().catch(() => undefined)
      }
    }
  }, [leave])

  // The chrome hides itself once the pointer settles and returns on the next
  // move or press.
  //
  // `pointerdown` matters as much as `pointermove`: a phone fires no move for
  // a tap, so without it the leave control would fade out and a touch member,
  // who has no Escape key either, would be left with no way out. A tap
  // anywhere brings it back, and hidden chrome takes no pointer events, so
  // that first tap can never leave by accident.
  React.useEffect(() => {
    let timer: number | null = null
    const wake = () => {
      setPointerAwake(true)
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setPointerAwake(false), CHROME_IDLE_MS)
    }
    wake()
    window.addEventListener("pointermove", wake)
    window.addEventListener("pointerdown", wake)
    return () => {
      window.removeEventListener("pointermove", wake)
      window.removeEventListener("pointerdown", wake)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  // Drawn on <body>, not in the page. The shell wraps every page in a
  // `z-[4]` box, which is its own stacking context, so an overlay rendered
  // inside it stays under the shell's header and sidebar however high its
  // own z-index climbs. The Pomoder tokens still resolve, because theme.css
  // declares them on the page root rather than on the shell's wrapper.
  //
  // Reaching for document.body during render is safe here: zen mode starts
  // off, so the server and the first client render never draw this.
  return createPortal(
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Zen mode"
      className="fixed inset-0 z-50 overflow-hidden bg-[var(--p-canvas)]"
    >
      <SceneBackdrop
        background={background}
        onMediaError={fallBackToDefault}
        shading="zen"
      />

      <div className="relative flex h-full flex-col items-center justify-center gap-10 px-6">
        <div className="relative size-[min(380px,calc(100vw-48px),calc(100vh-260px))]">
          <svg
            className="size-full"
            viewBox="0 0 380 380"
            aria-hidden="true"
          >
            <circle
              cx="190"
              cy="190"
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(var(--p-fg-rgb), 0.07)"
              strokeWidth="10"
            />
            <circle
              cx="190"
              cy="190"
              r={RING_RADIUS}
              fill="none"
              stroke={
                pomodoro.timer.running ? "var(--p-success)" : "var(--p-accent)"
              }
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 190 190)"
              style={{
                transition: "stroke-dashoffset .9s linear, stroke .2s ease",
              }}
            />
          </svg>
          {/* The ring is the pause control, so zen mode needs no button of
              its own. The hint below names it; the accessible label is here
              because the digits alone do not say what pressing does. */}
          <button
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={pomodoro.toggleTimer}
            onFocus={() => setChromeFocused(true)}
            onBlur={() => setChromeFocused(false)}
            aria-label={
              pomodoro.timer.running ? "Pause the timer" : "Start the timer"
            }
          >
            <time
              className="font-mono text-[clamp(56px,13vh,76px)] font-medium leading-none tracking-tight opacity-85"
              aria-hidden="true"
            >
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </time>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {phase}
            </span>
          </button>
        </div>

        {taskName ? (
          <strong className="max-w-[min(680px,calc(100vw-48px))] truncate text-center text-[22px] font-semibold tracking-tight">
            {taskName}
          </strong>
        ) : null}

        {/* Spoken on entry and on every phase change. The digits are left out
            on purpose: a live region carrying them would talk once a minute. */}
        <span className="sr-only" aria-live="polite">
          {phase}
          {taskName ? `, ${taskName}` : ""}
        </span>
      </div>

      <div
        className={cn(
          "absolute right-6 top-6 transition-opacity duration-500 motion-reduce:transition-none",
          !chromeShown && "pointer-events-none"
        )}
        style={{ opacity: chromeShown ? 1 : 0 }}
      >
        <button
          ref={leaveButton}
          className="flex h-11 items-center gap-2.5 rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-canvas-rgb),0.75)] px-5 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={leave}
          onFocus={() => setChromeFocused(true)}
          onBlur={() => setChromeFocused(false)}
        >
          <MinimizeIcon className="size-[17px]" aria-hidden="true" />
          Leave zen mode
        </button>
      </div>

      <p
        className="absolute inset-x-0 bottom-8 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-opacity duration-500 motion-reduce:transition-none"
        style={{ opacity: chromeShown ? 1 : 0 }}
      >
        Click the ring to {pomodoro.timer.running ? "pause" : "start"} · Esc to
        leave
      </p>
    </div>,
    document.body
  )
}
