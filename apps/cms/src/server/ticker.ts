import { runAutomationTick } from "@/server/automations/engine"
import { processDueBroadcasts } from "@/server/email/broadcast-send"

/**
 * The one background loop in this app, and the two jobs riding on it.
 *
 * There is no boot hook here, so the guards call `ensureBackgroundTicker` on
 * every request and the flag below makes every call after the first free. The
 * dev server reloads modules in place, which is why the flag lives on
 * `globalThis` rather than in module scope — a module-scoped one resets on
 * reload and would leave a second interval running behind the first.
 *
 * Both jobs run on the same fifteen seconds, and each takes its work by
 * claiming it, so a slow pass overlapping the next one is harmless.
 */

const TICK_MS = 15_000

declare global {
  var __customShellBackgroundTicker: boolean | undefined
}

export function ensureBackgroundTicker() {
  // Tests drive each pass themselves; an interval would outlive the test run.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return
  if (globalThis.__customShellBackgroundTicker) return
  globalThis.__customShellBackgroundTicker = true

  const tick = () => {
    // Kept apart on purpose: a thrown automation pass must not stop the
    // broadcast pass, and the other way round.
    void runAutomationTick().catch((error) => {
      console.error("Automation tick failed", error)
    })
    void processDueBroadcasts().catch((error) => {
      console.error("Broadcast tick failed", error)
    })
  }
  tick()
  setInterval(tick, TICK_MS)
}
