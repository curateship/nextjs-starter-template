/**
 * One pass of the app's background work, and nothing about when it happens.
 *
 * Two callers, deliberately: the dev server's request-started ticker in
 * `src/server/ticker.ts`, and the production worker in `worker/src/index.ts`.
 * Keeping "what runs" here and "how often" there is what lets the same jobs be
 * driven by a timer in development and by a separate program in production
 * without either one owning the list.
 *
 * Every job is isolated. A thrown automation pass must not stop the broadcast
 * pass, an app's own worker must not stop either, and the returned promise
 * never rejects — a caller can always `await` it and know the pass is over.
 */

/** What a finished pass has to say for itself. */
export type BackgroundPassResult = {
  /** How many of the jobs threw. Zero is the healthy answer. */
  failed: number
}

export async function runBackgroundPass(): Promise<BackgroundPassResult> {
  // Fetched on every pass, never imported at the top of this file.
  //
  // The dev server's interval is created ONCE and then outlives every reload.
  // A normal import would hand it the versions of these jobs that existed at
  // boot, and it would go on calling those forever — so editing a worker did
  // nothing until the whole server was restarted, which is a miserable way to
  // work and easy to mistake for the edit not working. Asking for them here
  // gets whatever the module graph holds right now.
  const [
    { runAutomationTick },
    { processDueBroadcasts },
    { processPendingEmailRetries },
    { appBackgroundWorkers },
  ] = await Promise.all([
    import("@/server/automations/engine"),
    import("@/server/email/broadcast-send"),
    import("@/server/email/retry"),
    import("@/server/app-options"),
  ])

  let failed = 0
  // The jobs return summaries of their own that nothing here reads — a pass
  // cares only that each one finished, and whether it threw.
  const run = (name: string, job: () => Promise<unknown>) =>
    job().catch((error) => {
      failed += 1
      console.error(`${name} failed`, error)
    })

  await Promise.all([
    run("Automation tick", runAutomationTick),
    run("Broadcast tick", processDueBroadcasts),
    run("Account-email retry tick", processPendingEmailRetries),
    // The app's own workers ride the same pass, each as isolated as the two
    // jobs above. Read inside the pass, never at module top level — the app's
    // answers may still be loading while this module is first imported.
    ...appBackgroundWorkers().map((worker) =>
      run(`${worker.name} tick`, () => worker.tick())
    ),
  ])

  return { failed }
}
