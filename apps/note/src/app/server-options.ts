import type { AppServerOptions } from "@/server/app-options"

/**
 * What this app changes about the shell, on the server side.
 *
 * The companion to `options.ts`. That file is seen by the browser, so it holds
 * the drawing and the wording; this one never is, so it holds the work — the
 * parts that reach the database or call something outside.
 *
 * Open `src/server/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts a value here, every app ever
 * copied from it conflicts on this file on every future merge — which is the
 * exact problem the file exists to avoid.
 *
 * New server functions still go in `src/lib/api/`, never here: the guard test
 * only walks that folder, so an endpoint declared here would be an unguarded
 * door nobody is told about.
 */
export const appServerOptions: AppServerOptions = {
  background: {
    workers: [
      {
        // Imports a pasted link (downloads a video or reads an X post),
        // downloads an X post's video, analyses a note somebody pressed
        // Analyse on, and merges plans, one job at a time, started without
        // holding up the rest of the pass; then clears Trash over 30 days
        // old. Imported on the tick, not up here, so loading this file never
        // drags yt-dlp, ffmpeg and Gemini into boot.
        name: "note-imports",
        tick: () => import("@/server/note/library/jobs").then((jobs) => jobs.tick()),
      },
    ],
  },
}
