import * as React from "react"

import {
  countdownIconKey,
  countdownProgress,
  countdownTitle,
  COUNTDOWN_RING_COLORS,
  COUNTDOWN_TRACK_COLOR,
  type CountdownFrame,
} from "@/lib/pomodoro/tab-countdown"
import { getRemainingSeconds } from "@/lib/pomodoro/timer"
import { pomodoroEngineState } from "@/lib/pomodoro/use-pomodoro"

/**
 * The DOM half of the tab countdown: it writes the title, draws the favicon
 * and puts both back when the timer stops.
 *
 * Three decisions worth knowing.
 *
 * The tick comes from a Web Worker. Chrome slows a hidden tab's own timers to
 * one a minute after five minutes, and a title that lags by a minute is worse
 * than no title; a worker's interval is not slowed. Every tick works the time
 * out from the timer's end moment rather than counting, so even a late tick
 * writes the right number. A browser that refuses the worker falls back to a
 * one-second window timer.
 *
 * The title we restore is whatever the router last wrote, not the title we
 * found on the way in. A MutationObserver watches the `<title>` element, and
 * anything it sees that we did not write becomes the title to restore. Without
 * it, navigating during a focus would restore the page you started on.
 *
 * The favicon takes over every `<link rel="icon">` the page already has rather
 * than adding one more. A browser given several icons picks the size it wants,
 * and the one it wants is not reliably the one we added last, so the ring goes
 * on all of them and stopping puts every original address back. A page with no
 * icon of its own gets a link of ours, removed when the timer stops.
 */

const TICK_WORKER_SOURCE = `setInterval(function () { postMessage(0) }, 1000)`

const ICON_SIZE = 32

/** One icon link the ring is drawn on, with the address to put back. */
type BorrowedIcon = { link: HTMLLinkElement; href: string; added: boolean }

let mounted = 0
let stopTicking: (() => void) | null = null
let titleWatcher: MutationObserver | null = null
/** The title the page itself wants, and the last title we wrote over it. */
let pageTitle = ""
let writtenTitle: string | null = null
let borrowedIcons: BorrowedIcon[] | null = null
let iconCanvas: HTMLCanvasElement | null = null
let paintedIconKey = ""
let paintedIconUrl = ""

function readFrame(): CountdownFrame {
  const { timer } = pomodoroEngineState()
  return {
    running: timer.running,
    mode: timer.mode,
    remainingSeconds: getRemainingSeconds(timer),
    durationSeconds: timer.durationMinutes * 60,
  }
}

/**
 * The icon links to draw on, found once per run. The page's own links are
 * borrowed; a page without one gets a link of ours instead.
 */
function borrowIcons(): BorrowedIcon[] {
  if (borrowedIcons) return borrowedIcons
  const existing = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  ]
  if (existing.length) {
    borrowedIcons = existing.map((link) => ({
      link,
      href: link.getAttribute("href") ?? "",
      added: false,
    }))
  } else {
    const link = document.createElement("link")
    link.rel = "icon"
    link.type = "image/png"
    link.setAttribute("data-pomodoro-countdown-icon", "true")
    document.head.append(link)
    borrowedIcons = [{ link, href: "", added: true }]
  }
  return borrowedIcons
}

function paintIconLinks() {
  for (const icon of borrowIcons())
    // Assigned only when it differs, so the browser is not asked to reload the
    // same picture, and re-assigned if anything else has written the address.
    if (icon.link.getAttribute("href") !== paintedIconUrl)
      icon.link.setAttribute("href", paintedIconUrl)
}

function drawIcon(frame: CountdownFrame) {
  const key = countdownIconKey(frame)
  if (key === paintedIconKey) {
    paintIconLinks()
    return
  }
  if (!iconCanvas) {
    iconCanvas = document.createElement("canvas")
    iconCanvas.width = ICON_SIZE
    iconCanvas.height = ICON_SIZE
  }
  const context = iconCanvas.getContext("2d")
  if (!context) return
  const centre = ICON_SIZE / 2
  const radius = 13
  const color = COUNTDOWN_RING_COLORS[frame.mode]
  context.clearRect(0, 0, ICON_SIZE, ICON_SIZE)
  context.lineWidth = 4
  context.lineCap = "butt"
  context.strokeStyle = COUNTDOWN_TRACK_COLOR
  context.beginPath()
  context.arc(centre, centre, radius, 0, Math.PI * 2)
  context.stroke()
  const swept = countdownProgress(frame) * Math.PI * 2
  if (swept > 0) {
    context.strokeStyle = color
    context.beginPath()
    // From twelve o'clock, clockwise, so the ring fills as the phase runs out.
    context.arc(centre, centre, radius, -Math.PI / 2, -Math.PI / 2 + swept)
    context.stroke()
  }
  // The dot says which phase this is at 16px, where the arc alone is a smudge.
  context.fillStyle = color
  context.beginPath()
  context.arc(centre, centre, 3.5, 0, Math.PI * 2)
  context.fill()

  paintedIconUrl = iconCanvas.toDataURL("image/png")
  paintedIconKey = key
  paintIconLinks()
}

function restoreIcon() {
  paintedIconKey = ""
  paintedIconUrl = ""
  if (!borrowedIcons) return
  for (const icon of borrowedIcons) {
    if (icon.added) icon.link.remove()
    else icon.link.setAttribute("href", icon.href)
  }
  borrowedIcons = null
}

function restoreTitle() {
  if (writtenTitle === null) return
  if (pageTitle && document.title !== pageTitle) document.title = pageTitle
  writtenTitle = null
}

function paint() {
  const frame = readFrame()
  if (!frame.running) {
    restoreTitle()
    restoreIcon()
    return
  }
  const title = countdownTitle(frame)
  if (document.title !== title) {
    writtenTitle = title
    document.title = title
  }
  drawIcon(frame)
}

function watchPageTitle() {
  pageTitle = document.title
  if (typeof MutationObserver !== "function") return
  titleWatcher = new MutationObserver(() => {
    // Our own write is the one title that is not the page's own.
    if (document.title === writtenTitle) return
    pageTitle = document.title
    if (writtenTitle !== null) paint()
  })
  titleWatcher.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

function startTicking(onTick: () => void) {
  if (typeof Worker === "function" && typeof URL.createObjectURL === "function")
    try {
      const source = URL.createObjectURL(
        new Blob([TICK_WORKER_SOURCE], { type: "text/javascript" })
      )
      const worker = new Worker(source)
      worker.onmessage = () => onTick()
      return () => {
        worker.terminate()
        URL.revokeObjectURL(source)
      }
    } catch {
      // A browser or a content policy that refuses blob workers gets the
      // window timer below, which is throttled but never wrong.
    }
  const id = window.setInterval(onTick, 1000)
  return () => window.clearInterval(id)
}

/**
 * Runs the countdown in the tab for as long as the product shell is mounted.
 * Several mounts share one driver, and the last one to leave puts the title
 * and the icon back.
 */
export function useTabCountdown() {
  React.useEffect(() => {
    mounted += 1
    if (mounted === 1) {
      watchPageTitle()
      stopTicking = startTicking(paint)
      window.addEventListener("pomodoro:timer-running", paint)
      // Coming back to the tab should show the right second at once rather
      // than up to a second late.
      document.addEventListener("visibilitychange", paint)
      paint()
    }
    return () => {
      mounted -= 1
      if (mounted > 0) return
      window.removeEventListener("pomodoro:timer-running", paint)
      document.removeEventListener("visibilitychange", paint)
      stopTicking?.()
      stopTicking = null
      titleWatcher?.disconnect()
      titleWatcher = null
      restoreTitle()
      restoreIcon()
    }
  }, [])
}
