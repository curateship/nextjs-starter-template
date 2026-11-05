import type { AppServerOptions } from "@/server/app-options"
import {
  CAROUSEL_MEDIA_FILTER,
  EDITOR_MEDIA_FILTER,
} from "@/lib/video/media-saved-views"
import { mediaSavedViewScreen } from "@/server/video/media-saved-views"

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
  media: {
    // The smooth copies count towards the Media library's storage total.
    storageUsed: (ownerId) =>
      import("@/server/video/storage-used").then((used) =>
        used.videoStorageUsed(ownerId)
      ),
  },
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
        // Starts and checks durable AI shot jobs. A page reload never owns the job.
        name: "video-generation",
        tick: () =>
          import("@/server/video/asset-factories/generations").then(
            (generations) => generations.videoGenerationTick()
          ),
      },
      {
        // Puts a finished shot made from a timeline picture in that
        // picture's place, when no editor has the project open to do it.
        name: "video-moving-stills",
        tick: () =>
          import("@/server/video/asset-factories/moving-stills").then(
            (stills) => stills.movingStillTick()
          ),
      },
      {
        // Asks Sync Labs about lip matching nobody's editor is waiting on, so
        // it still lands, is charged, and the files sent are deleted.
        name: "video-lip-sync",
        tick: () =>
          import("@/server/video/lip-sync").then((lipSync) => lipSync.lipSyncTick()),
      },
      {
        // Ends a Send to Promo nobody's window is watching once it has waited
        // three hours, with a bell, so a send never sits "sending" for ever
        // (workspace/docs/send-to-promo.md).
        name: "video-promo-sends",
        tick: () =>
          import("@/server/video/promo-sends").then((sends) => sends.sweepStalePromoSends()),
      },
      {
        // Starts a Send to Video from Viral whose copy was lost to a restart,
        // and ends one stuck past its hour (workspace/docs/viral-connection.md).
        name: "video-viral-arrivals",
        tick: () =>
          import("@/server/video/viral-link/arrivals").then((arrivals) => arrivals.sweepViralArrivals()),
      },
      {
        // Makes a brief's scenes one after another, then lays made scenes on
        // the timeline when no editor has the project open to do it.
        name: "video-briefs",
        tick: () =>
          import("@/server/video/briefs").then((briefs) => briefs.briefTick()),
      },
      {
        // Downloads the viral video an editor video copies and has Gemini
        // break it down, when Try again on the Copy panel put it back in the
        // queue. A restart puts an interrupted job back.
        name: "video-viral-breakdown",
        tick: () =>
          import("@/server/video/viral/saved-videos").then((saved) =>
            saved.viralVideoTick()
          ),
      },
    ],
  },
  // Views on the video editor's Media panel and the carousel editor's Image
  // panel.
  savedViews: {
    screens: {
      [EDITOR_MEDIA_FILTER.kind]: mediaSavedViewScreen(EDITOR_MEDIA_FILTER),
      [CAROUSEL_MEDIA_FILTER.kind]: mediaSavedViewScreen(CAROUSEL_MEDIA_FILTER),
    },
  },
}
