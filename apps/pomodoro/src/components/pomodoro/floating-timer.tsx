import * as React from "react"
import { createPortal } from "react-dom"
import { PauseIcon, PlayIcon } from "lucide-react"

import { loadPomodoroFonts } from "@/components/pomodoro/fonts"
import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import { Button } from "@/components/ui/button"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useShownBackground } from "@/lib/pomodoro/break-look"
import {
  floatingTimerEnabled,
  useFloatingTimerEnabled,
} from "@/lib/pomodoro/floating-timer-setting"
import { MODE_LABELS } from "@/lib/pomodoro/timer"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

/**
 * The floating timer: a small window holding the time left, the phase, the
 * task and one start or pause button, which stays on top of every other app
 * while you work (Tyler's pick, 7 Nov 2026). See
 * `workspace/docs/floating-timer.md`.
 *
 * It is the browser's Document Picture-in-Picture window, which only Chrome,
 * Edge and Arc have; everywhere else the button that opens it is not drawn.
 * The window holds no timer of its own. Its contents are rendered from this
 * page's React tree through a portal, reading the same engine as the ring, so
 * the two can never show different times. The host lives in the Pomoder
 * layout rather than on the timer screen, so moving between pages keeps the
 * window and its time; closing the window, or the tab, ends it.
 */

type DocumentPictureInPicture = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
  window: Window | null
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

const WINDOW_SIZE = { width: 280, height: 260 }

let floatingWindow: Window | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether this browser can open the floating window at all. */
export function useFloatingTimerSupported() {
  return React.useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && "documentPictureInPicture" in window,
    () => false
  )
}

/** Whether the floating window is open now. */
export function useFloatingTimerOpen() {
  return React.useSyncExternalStore(
    subscribe,
    () => floatingWindow !== null,
    () => false
  )
}

/**
 * Copies the page's stylesheets into the new window, which starts with none.
 * A sheet whose rules cannot be read is linked by its address instead.
 */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style")
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n")
      target.head.append(style)
    } catch {
      if (!sheet.href) continue
      const link = target.createElement("link")
      link.rel = "stylesheet"
      link.href = sheet.href
      target.head.append(link)
    }
  }
}

/**
 * Keeps the window's <html> and <body> dressed like the page's: the dark
 * class, the dark shade and the app font, so switching Dark mode on the page
 * switches the window too.
 */
function mirrorRoot(target: Window) {
  const copy = () => {
    target.document.documentElement.className = document.documentElement.className
    const shade = document.documentElement.getAttribute("data-dark-shade")
    if (shade) target.document.documentElement.setAttribute("data-dark-shade", shade)
    else target.document.documentElement.removeAttribute("data-dark-shade")
    target.document.body.className = document.body.className
  }
  copy()
  const observer = new MutationObserver(copy)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-dark-shade"],
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

/**
 * Opens the floating window, or brings the open one forward. The browser
 * refuses the window unless a press or a key came just before, so an
 * `automatic` try (a focus starting) checks that first and gives up quietly;
 * only a press on the button says it failed. Chrome's own tab-switch call
 * comes with its permission and no press, so it passes `granted`.
 */
export async function openFloatingTimer({ automatic = false, granted = false } = {}) {
  if (floatingWindow) {
    if (!automatic) floatingWindow.focus()
    return
  }
  const picture = window.documentPictureInPicture
  if (!picture) return
  if (automatic && !granted && navigator.userActivation && !navigator.userActivation.isActive)
    return
  try {
    const opened = await picture.requestWindow(WINDOW_SIZE)
    opened.document.title = "Flowfly timer"
    copyStyles(opened.document)
    loadPomodoroFonts(opened.document)
    const stopMirroring = mirrorRoot(opened)
    opened.addEventListener(
      "pagehide",
      () => {
        stopMirroring()
        if (floatingWindow === opened) floatingWindow = null
        emit()
      },
      { once: true }
    )
    floatingWindow = opened
    emit()
  } catch {
    if (!automatic)
      showErrorToast("The floating timer could not open. Try the button again.")
  }
}

/**
 * Opens the window by itself (Tyler, 7 Nov 2026: "The floating timer should
 * be automatic. I shoudlnt need to press any button"), unless the member
 * switched it off in Settings → Timer.
 *
 * - **When a focus starts.** The Start press, Space or the header's Start is
 *   the press the browser needs. A focus started on another device arrives
 *   with no press here, so it opens nothing.
 * - **When you leave the tab while it runs**, where Chrome offers it: the
 *   media session's "enterpictureinpicture" action, which Chrome sends to a
 *   page playing sound when you switch away, and lets it open the window
 *   without a press.
 *
 * Closing the window keeps it closed until the next focus starts.
 */
function useAutomaticOpen() {
  const pomodoro = usePomodoro()
  const enabled = useFloatingTimerEnabled()
  const focusing = pomodoro.timer.running && pomodoro.timer.mode === "focus"
  const wasFocusing = React.useRef(focusing)
  React.useEffect(() => {
    const started = focusing && !wasFocusing.current
    wasFocusing.current = focusing
    if (started && floatingTimerEnabled()) void openFloatingTimer({ automatic: true })
  }, [focusing])

  React.useEffect(() => {
    const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession
    if (!session || !enabled || !pomodoro.timer.running) return
    try {
      session.setActionHandler(
        "enterpictureinpicture" as MediaSessionAction,
        () => void openFloatingTimer({ automatic: true, granted: true })
      )
    } catch {
      // A browser without the action: the focus start still opens it.
      return
    }
    return () => {
      try {
        session.setActionHandler("enterpictureinpicture" as MediaSessionAction, null)
      } catch {
        // Nothing was set.
      }
    }
  }, [enabled, pomodoro.timer.running])
}

/** Mounted once, in the Pomoder layout: draws the window's contents while it is open. */
export function FloatingTimerHost() {
  const open = useFloatingTimerOpen()
  useAutomaticOpen()
  if (!open || !floatingWindow) return null
  return createPortal(<FloatingTimerView />, floatingWindow.document.body)
}

const RING_RADIUS = 46
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function FloatingTimerView() {
  const pomodoro = usePomodoro()
  // Your background behind the ring, faded the way zen mode fades it (Tyler,
  // 7 Nov 2026: "Add the fade background too"), the break's one on a break.
  const { background, fallBackToDefault } = useShownBackground({
    onBreak: pomodoro.timer.mode !== "focus",
  })
  const minutes = Math.floor(pomodoro.remainingSeconds / 60)
  const seconds = pomodoro.remainingSeconds % 60
  const totalSeconds = pomodoro.timer.durationMinutes * 60
  const dashOffset =
    RING_CIRCUMFERENCE * (1 - pomodoro.remainingSeconds / totalSeconds)
  const phase = MODE_LABELS[pomodoro.timer.mode]
  const taskName =
    pomodoro.timer.mode === "focus" ? (pomodoro.selectedTask?.title ?? "") : ""
  const running = pomodoro.timer.running

  return (
    // The marker switches the Pomoder tokens on inside this window too.
    <div
      data-pomodoro-screen
      className="relative flex h-screen flex-col items-center justify-center gap-3 overflow-hidden bg-[var(--p-canvas)] p-4 text-foreground"
    >
      <SceneBackdrop
        background={background}
        onMediaError={fallBackToDefault}
        shading="zen"
      />
      {/* 140px across holds "25:00" at 24px with room on both sides; 28px in
          a 120px ring ran into the ring (Tyler, 7 Nov 2026: "The number is
          too big that it goes to the edge"). */}
      <div className="relative size-[140px]">
        <svg className="size-full" viewBox="0 0 120 120" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(var(--p-fg-rgb), 0.07)"
            strokeWidth="6"
          />
          <circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            fill="none"
            stroke={running ? "var(--p-success)" : "var(--p-accent)"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dashoffset .9s linear, stroke .2s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <time className="font-mono text-[24px] font-medium leading-none tracking-tight">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </time>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {phase}
          </span>
        </div>
      </div>
      {taskName ? (
        <strong className="relative max-w-full truncate text-sm font-semibold">
          {taskName}
        </strong>
      ) : null}
      <Button
        className="relative bg-[var(--p-accent)] px-5 text-[var(--p-on-accent)] hover:bg-[var(--p-accent-2)]"
        onClick={pomodoro.toggleTimer}
      >
        {running ? (
          <PauseIcon aria-hidden="true" />
        ) : (
          <PlayIcon aria-hidden="true" />
        )}
        {running ? "Pause" : "Start"}
      </Button>
    </div>
  )
}
