import {
  DEFAULT_CHIME,
  findChime,
  type ChimeId,
} from "@/lib/pomodoro/chimes"
import type { TimerMode } from "@/lib/pomodoro/timer"

// One alert per completed timer transition, even when several timer ticks or
// hook instances observe the same completion.
export function createCompletionAlertGate() {
  const fired = new Set<string>()
  return (key: string) => {
    if (fired.has(key)) return false
    fired.add(key)
    if (fired.size > 20) fired.delete(fired.values().next().value as string)
    return true
  }
}

export function completionAlertMessage(completedMode: TimerMode) {
  return completedMode === "focus"
    ? "Focus session complete. Time for a break."
    : "Break finished. Ready to focus?"
}

type AudioContextConstructor = typeof AudioContext
declare global {
  interface Window {
    webkitAudioContext?: AudioContextConstructor
  }
}

let alertsEnabled = false
/** The chime for a focus ending and for a break ending. */
let chimes: { focus: ChimeId; break: ChimeId } = {
  focus: DEFAULT_CHIME,
  break: DEFAULT_CHIME,
}
let chimeContext: AudioContext | null = null
let gesturePrimerAttached = false
const gate = createCompletionAlertGate()

function createChimeContext() {
  try {
    const Constructor = window.AudioContext || window.webkitAudioContext
    if (!Constructor) return null
    chimeContext ??= new Constructor()
    if (chimeContext.state === "suspended") void chimeContext.resume().catch(() => undefined)
    return chimeContext
  } catch {
    return null
  }
}

// Audio contexts only start from a user gesture; arm the next pointer press so
// a reload with alerts already enabled can still chime later.
function primeOnNextGesture() {
  if (gesturePrimerAttached || typeof window === "undefined") return
  gesturePrimerAttached = true
  window.addEventListener(
    "pointerdown",
    () => {
      gesturePrimerAttached = false
      if (alertsEnabled) createChimeContext()
    },
    { once: true }
  )
}

export function setCompletionAlertsEnabled(enabled: boolean) {
  alertsEnabled = enabled
  if (enabled && (!chimeContext || chimeContext.state === "suspended")) primeOnNextGesture()
}

// Call from an explicit settings action: the click both unlocks the chime and
// is the only place the notification permission prompt may appear.
export async function enableCompletionAlerts(): Promise<NotificationPermission | "unsupported"> {
  setCompletionAlertsEnabled(true)
  createChimeContext()
  if (typeof Notification === "undefined") return "unsupported"
  if (Notification.permission !== "default") return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function setCompletionChimes(next: { focus: ChimeId; break: ChimeId }) {
  chimes = next
}

function playChime(context: AudioContext, chimeId: ChimeId) {
  const start = context.currentTime + 0.02
  for (const tone of findChime(chimeId).tones) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = tone.wave
    oscillator.frequency.value = tone.frequency
    gain.gain.setValueAtTime(0, start + tone.offset)
    gain.gain.linearRampToValueAtTime(tone.gain, start + tone.offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + tone.offset + tone.decay
    )
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start + tone.offset)
    oscillator.stop(start + tone.offset + tone.decay + 0.1)
  }
}

/**
 * Plays a chime now, from a Preview press. Works with alerts switched off and
 * no timer running: the press is the gesture the browser needs to make sound.
 */
export function previewChime(chimeId: ChimeId) {
  try {
    const context = createChimeContext()
    if (!context) return false
    if (context.state === "running") playChime(context, chimeId)
    // A context that is still waking plays once it can.
    else void context.resume().then(() => playChime(context, chimeId))
    return true
  } catch {
    return false
  }
}

/**
 * The alert for a finished phase. A focus ending and a break ending each have
 * their own chime, because they mean opposite things: stop working, and start
 * again.
 */
export function fireCompletionAlert(
  key: string,
  message: string,
  completedMode: TimerMode
) {
  if (!alertsEnabled || !gate(key)) return false
  try {
    const context = createChimeContext()
    const chimeId = completedMode === "focus" ? chimes.focus : chimes.break
    if (context && context.state === "running") playChime(context, chimeId)
  } catch {
    // A blocked chime must never interfere with timer completion.
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Pomoder", { body: message, tag: "pomodoro-timer" })
    }
  } catch {
    // Denied or unavailable notifications fail silently.
  }
  return true
}
