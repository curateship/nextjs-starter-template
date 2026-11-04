/**
 * The development background loop: a pass every fifteen seconds, started by
 * whichever request happens to arrive first.
 *
 * There is no boot hook here, so the guards call `ensureBackgroundTicker` on
 * every request and the flag below makes every call after the first free. The
 * dev server reloads modules in place, which is why the flag lives on
 * `globalThis` rather than in module scope — a module-scoped one resets on
 * reload and would leave a second interval running behind the first.
 *
 * **In production this does nothing on purpose.** A deployed app runs its
 * background work in a separate worker program (`worker/src/index.ts`), which
 * starts on its own and does not wait for a visitor. Leaving the timer on in
 * the web container as well would mean every web replica running the same
 * jobs: harmless, because each job claims its work before doing it, but it
 * hides the real answer to "is background work running" behind however many
 * web containers happen to be up. One place ticks, and it is the worker.
 *
 * What each pass actually does lives in `src/server/background-pass.ts`, which
 * is the file the worker runs too.
 */

const TICK_MS = 15_000

declare global {
  var __customShellBackgroundTicker: boolean | undefined
}

/**
 * Whether this process is the one that should be ticking.
 *
 * Split out from the timer below so it can be asked about an environment other
 * than the one the question is asked in — otherwise "production does not tick"
 * is untestable, because a test run is never production.
 */
export function backgroundTickerRunsHere(env: NodeJS.ProcessEnv = process.env) {
  // Tests drive each pass themselves; an interval would outlive the test run.
  if (env.VITEST || env.NODE_ENV === "test") return false
  // Production's passes belong to the worker — see the note above.
  if (env.NODE_ENV === "production") return false
  return true
}

export function ensureBackgroundTicker() {
  if (!backgroundTickerRunsHere()) return
  if (globalThis.__customShellBackgroundTicker) return
  globalThis.__customShellBackgroundTicker = true

  // Imported inside the interval rather than at the top of the file, so an
  // edit to a job reaches the loop that was created before it. The reason is
  // written out in `background-pass.ts`.
  const safeTick = () => {
    void import("@/server/background-pass")
      .then(({ runBackgroundPass }) => runBackgroundPass())
      .catch((error) => {
        console.error("Background pass failed to start", error)
      })
  }

  safeTick()
  setInterval(safeTick, TICK_MS)
}
