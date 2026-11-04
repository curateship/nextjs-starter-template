# Export notices

When a video export finishes, the bell in the top bar gets one notice. You can
start an export, go and do something else, and find out when it's done.

## What sends one

- **Ready:** "Reel (Tall 9:16) is ready", with "Download or share it from the
  Exports page." under it.
- **Failed:** "Reel (Tall 9:16) could not be exported", with "The Exports page
  says why, and Try again is there." under it. This covers a render that broke,
  and one cut off by a server restart twice in a row (`INTERRUPTED_MESSAGE`).
- **Stopped:** nothing. You pressed Stop, so you already know.
- **A carousel export:** nothing. A carousel is made while its window waits, so
  you're already looking at it.

The name is the export's own title, which is the video's name unless one was
typed in the export window. The shape uses the same words as the export window
(`EXPORT_SHAPES` in `src/lib/video/render.ts`).

## Where it comes from

`noticeExport` in `src/server/video/render-queue.ts` writes it, copying the
smooth-copy notice in `media-workers.ts`. It is the shell's `app_activity`
kind, so Settings → Notifications can switch it off with the rest of the app's
activity. The worker writes it once the row is marked ready or failed, and only
when that write succeeded. An export taken over by another worker never sends a
second notice.

The bell has no link to the export. The shell's notices carry words and no
address, so the words name the Exports page instead.

Only the bell gets the notice: no email and no browser pop-up. Tyler picked
that on 4 Nov 2026 ("Bell only").

## Tests

`src/server/video/render-queue-notices.test.ts` runs the real worker on a test
database with the drawing faked: one notice when ready, one when failed, none
when stopped, and one when restarts cut it off twice.
