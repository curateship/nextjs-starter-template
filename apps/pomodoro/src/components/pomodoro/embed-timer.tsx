import * as React from "react"
import { ExternalLinkIcon, PauseIcon, PlayIcon } from "lucide-react"

import "@/components/pomodoro/theme.css"
import "@/components/pomodoro/fonts"
import { Button } from "@/components/ui/button"
import { setProductAccount } from "@/lib/pomodoro/auth-state"
import { setCompletionAlertsEnabled } from "@/lib/pomodoro/completion-alerts"
import { useGuestsStayDark } from "@/lib/pomodoro/guest-theme"
import { MODE_LABELS } from "@/lib/pomodoro/timer"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"
import { useSpaceToggle } from "@/lib/pomodoro/use-space-toggle"

const RING_RADIUS = 92
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * The timer made to sit inside a Notion page, at `/embed/timer` (Tyler's pick,
 * 7 Nov 2026). See `workspace/docs/embed-timer.md`.
 *
 * Only the ring, the phase and Start or Pause, with a small link to the full
 * site. It always runs as a guest, whoever is signed in on the full site
 * (Tyler, 7 Nov 2026: guest only). A browser keeps an embedded page's storage
 * apart from the site's own, so the embed's focuses live in the embed and
 * never reach Stats. The chime at the end is always on here, because the
 * embed has no Settings to switch it on from.
 */
export function EmbedTimer() {
  const pomodoro = usePomodoro()
  React.useEffect(() => {
    setProductAccount(null)
    setCompletionAlertsEnabled(true)
  }, [])
  useSpaceToggle(pomodoro.toggleTimer)
  // Dark, the way the signed-out front page is.
  useGuestsStayDark(false)

  const minutes = Math.floor(pomodoro.remainingSeconds / 60)
  const seconds = pomodoro.remainingSeconds % 60
  const totalSeconds = pomodoro.timer.durationMinutes * 60
  const dashOffset =
    RING_CIRCUMFERENCE * (1 - pomodoro.remainingSeconds / totalSeconds)
  const running = pomodoro.timer.running

  return (
    <main
      data-pomodoro-screen
      className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--p-canvas)] p-4 text-foreground"
    >
      <div className="relative aspect-square w-[min(220px,calc(100vw-32px),calc(100vh-110px))]">
        <svg className="size-full" viewBox="0 0 220 220" aria-hidden="true">
          <circle
            cx="110"
            cy="110"
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(var(--p-fg-rgb), 0.07)"
            strokeWidth="8"
          />
          <circle
            cx="110"
            cy="110"
            r={RING_RADIUS}
            fill="none"
            stroke={running ? "var(--p-success)" : "var(--p-accent)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 110 110)"
            style={{ transition: "stroke-dashoffset .9s linear, stroke .2s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <time className="font-mono text-[44px] font-semibold leading-none tracking-tight">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </time>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {MODE_LABELS[pomodoro.timer.mode]}
          </span>
        </div>
      </div>
      <Button
        size="lg"
        className="bg-[var(--p-accent)] px-7 text-[var(--p-on-accent)] hover:bg-[var(--p-accent-2)]"
        onClick={pomodoro.toggleTimer}
      >
        {running ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
        {running ? "Pause" : "Start"}
      </Button>
      <a
        href="/timer"
        target="_blank"
        rel="noreferrer"
        className="absolute right-3 top-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
      >
        Open Flowfly
        <ExternalLinkIcon className="size-3" aria-hidden="true" />
      </a>
    </main>
  )
}

/**
 * What a Notion page holding the timer shows while the admin has it switched
 * off in Settings → Notion timer: one line and the way to the full site.
 */
export function EmbedTimerOff() {
  useGuestsStayDark(false)
  return (
    <main
      data-pomodoro-screen
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--p-canvas)] p-4 text-center text-foreground"
    >
      <p className="text-sm text-muted-foreground">
        This timer is switched off for now.
      </p>
      <a
        href="/timer"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-sm font-semibold text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
      >
        Open Flowfly
        <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
      </a>
    </main>
  )
}
