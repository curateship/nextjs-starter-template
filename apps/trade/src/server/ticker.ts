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

  const tick = async () => {
    // Fetched on every pass, never imported at the top of this file.
    //
    // The interval below is created ONCE and then outlives every reload. A
    // normal import would hand it the versions of these jobs that existed at
    // boot, and it would go on calling those forever — so editing a worker
    // did nothing until the whole server was restarted, which is a miserable
    // way to work and easy to mistake for the edit not working. Asking for
    // them here gets whatever the module graph holds right now.
    const [{ runAutomationTick }, { processDueBroadcasts }, { appBackgroundWorkers }] =
      await Promise.all([
        import("@/server/automations/engine"),
        import("@/server/email/broadcast-send"),
        import("@/server/app-options"),
      ])

    // Kept apart on purpose: a thrown automation pass must not stop the
    // broadcast pass, and the other way round.
    void runAutomationTick().catch((error) => {
      console.error("Automation tick failed", error)
    })
    void processDueBroadcasts().catch((error) => {
      console.error("Broadcast tick failed", error)
    })
    // The app's own workers ride the same loop, each as isolated as the two
    // jobs above. Read inside the tick, never at module top level — the app's
    // answers may still be loading while this module is first imported.
    for (const worker of appBackgroundWorkers()) {
      void worker.tick().catch((error) => {
        console.error(`${worker.name} tick failed`, error)
      })
    }
  }

  const safeTick = () => {
    void tick().catch((error) => {
      console.error("Background tick failed to start", error)
    })
  }
  safeTick()
  setInterval(safeTick, TICK_MS)
}
