import type { TimerMode } from "@/lib/pomodoro"

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

function playChime(context: AudioContext) {
  const start = context.currentTime + 0.02
  for (const [offset, frequency] of [
    [0, 659.26],
    [0.22, 987.77],
  ] as const) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start + offset)
    gain.gain.linearRampToValueAtTime(0.22, start + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.9)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + 1)
  }
}

export function fireCompletionAlert(key: string, message: string) {
  if (!alertsEnabled || !gate(key)) return false
  try {
    const context = createChimeContext()
    if (context && context.state === "running") playChime(context)
  } catch {
    // A blocked chime must never interfere with timer completion.
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Pomoder", { body: message, tag: "pomoder-timer" })
    }
  } catch {
    // Denied or unavailable notifications fail silently.
  }
  return true
}
