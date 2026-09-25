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
        // Builds playback proxies and timeline filmstrips for library videos.
        // Imported on the tick, not up here, so loading this options file
        // never drags the worker (and its ffmpeg plumbing) into boot.
        name: "video-media",
        tick: () =>
          import("@/server/video/media-workers").then((workers) =>
            workers.videoMediaTick()
          ),
      },
      {
        // Renders exports, and puts back anything a restart interrupted.
        name: "video-render",
        tick: () =>
          import("@/server/video/render-queue").then((queue) =>
            queue.videoRenderTick()
          ),
      },
      {
        // Starts and checks durable Veo jobs. A page reload never owns the job.
        name: "video-generation",
        tick: () =>
          import("@/server/video/asset-factories/generations").then(
            (generations) => generations.videoGenerationTick()
          ),
      },
    ],
  },
}
