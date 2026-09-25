import type { AppServerOptions } from "@/server/app-options"

import { advanceDueRooms } from "@/server/pomodoro/rooms"
import { processNextMediaUpload } from "@/server/pomodoro/media-worker"
import { processNextGeneration } from "@/server/pomodoro/generation-worker"

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
        // The focus rooms' clock. Each pass claims every room whose timed
        // phase has expired and advances it, sequence-guarded, so phases
        // move with every browser tab closed. Overlapping passes are
        // harmless: the second claim sees a bumped sequence and no-ops.
        name: "pomodoro-room-clock",
        tick: async () => {
          await advanceDueRooms()
        },
      },
      {
        // Members' own backgrounds and sound loops, re-encoded with FFmpeg —
        // video to 720p without sound, audio loudness-normalised. One upload
        // per pass, because FFmpeg is the most expensive thing this app does
        // and a queue of videos must not hold the room clock behind it.
        // Overlapping passes are harmless: the claim is the update itself.
        name: "pomodoro-media-uploads",
        tick: processNextMediaUpload,
      },
      {
        // AI backgrounds and soundscapes. One per pass, and its own worker
        // rather than a branch inside the uploads one: a Veo render can take
        // minutes, and a member waiting on a re-encode should not be stuck
        // behind somebody else's video being dreamt up.
        name: "pomodoro-generations",
        tick: processNextGeneration,
      },
    ],
  },
}
