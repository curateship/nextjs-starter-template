import type { AppServerOptions } from "@/server/app-options"

import { advanceDueRooms } from "@/server/pomodoro/rooms"
import { openDueRooms } from "@/server/pomodoro/scheduled-rooms"
import { processNextMediaUpload } from "@/server/pomodoro/media-worker"
import { processNextCatalogFile } from "@/server/pomodoro/catalog-worker"
import { processPixabayImports } from "@/server/pomodoro/pixabay-worker"
import { processNextGeneration } from "@/server/pomodoro/generation-worker"
import {
  readFocusHoursRow,
  readOpenRoomsRow,
} from "@/server/pomodoro/front-page-rows"
import { listedProfilePaths } from "@/server/pomodoro/public-profile"
import { runStreakReminderPass } from "@/server/pomodoro/streak-reminder"

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
  billing: {
    /**
     * Stripe hands everyone back to the product's own plans page, never to
     * the shell's `/pricing` or its success page, which the product does not
     * link to. The paid return carries `welcome=pro`, and the plans page
     * confirms the session itself so Pro is on before the page draws.
     */
    returnPaths: {
      checkoutSuccess: "/plans?welcome=pro",
      checkoutCancel: "/plans",
      portalReturn: "/plans",
    },
  },
  pages: {
    /**
     * What fills the two public front page rows. Both answer `null` on a week
     * quieter than the row's floor, which is how the shell is told to leave the
     * row off the page.
     *
     * Neither reads anything per visitor: the figures are held for a window
     * inside the reader, because this is the signed-out front page and a visit
     * must not become a query.
     */
    frontPageRowReaders: {
      "focus-hours": readFocusHoursRow,
      "open-rooms": readOpenRoomsRow,
    },
  },
  sitemap: {
    /**
     * The public profiles that asked to be found, and the directory page
     * itself.
     *
     * **Only listed profiles.** A profile switched on but not listed stays
     * reachable by its address and out of search results, which is the whole
     * reason the listing is a second switch rather than part of the first.
     * Somebody who wanted a page to point at from their own bio did not
     * thereby ask to be indexed.
     */
    extraEntries: async () => [
      { path: "/users" },
      ...(await listedProfilePaths()),
    ],
  },
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
        // Booked rooms. Each pass opens every room whose start time has
        // passed and then sends the invitations still waiting to go out.
        // Both claim their work with a guard in the WHERE, so overlapping
        // passes cannot open a room twice or email one person twice.
        name: "pomodoro-scheduled-rooms",
        tick: async () => {
          await openDueRooms()
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
        // An admin's catalogue sounds and theme films: measured, re-encoded
        // and only then made the item's file. Its own worker so a long film
        // never holds a member's upload behind it, one file per pass.
        name: "pomodoro-catalog-files",
        tick: processNextCatalogFile,
      },
      {
        // Pictures and films an admin imported from Pixabay links: up to five
        // pictures or one film per pass, copied into the bucket. A film then
        // goes to pomodoro-catalog-files to be shrunk like an upload.
        name: "pomodoro-pixabay-imports",
        tick: processPixabayImports,
      },
      {
        // AI backgrounds and soundscapes. One per pass, and its own worker
        // rather than a branch inside the uploads one: a Veo render can take
        // minutes, and a member waiting on a re-encode should not be stuck
        // behind somebody else's video being dreamt up.
        name: "pomodoro-generations",
        tick: processNextGeneration,
      },
      {
        // The evening streak reminder. At most one pass a minute; each person
        // is claimed for the day before anything is sent, so overlapping
        // passes and processes nudge nobody twice.
        name: "pomodoro-streak-reminders",
        tick: runStreakReminderPass,
      },
    ],
  },
}
