# Where a file's address comes from

Every address the video app hands to the browser is read, not built. The bucket
that holds the file is saved in the database under Settings → Storage, so
working out where a picture or a clip lives means a read, and every caller waits
for the answer.

## The one function that answers it

`getPublicMediaUrl(storagePath)` in `src/server/media/storage.ts` is the shell's
and answers a promise. The shell's `serializeMedia` in
`src/server/media/library.ts` calls it, so that one answers a promise too.

Video's own code calls both, in five places:

- `src/server/video/media-urls.ts:24` — `videoPlaybackUrl`, which picks the
  smooth playback copy when one is ready and the original file otherwise.
- `src/server/video/media-list.ts:132` — the media panel's page of files.
- `src/server/video/projects.ts:145` — the addresses on a project's timeline,
  and `:200` for a project's cover picture.
- `src/server/video/asset-factories/*.ts` — the actor, first-frame and
  generation lists, each of which names the picture or clip it produced.
- `src/server/video/voice.ts:242` — the voiceover it has just stored.

## Why it is worth knowing

Before 20 Sep 2026 the bucket came from environment variables, which are read
from memory, so the address came back as a plain string and the calls above were
written without `await`. A saved bucket can change while the app is running, so
the shell moved the read into the database and these calls now wait. Adding a
new call site means waiting too, or the address reaches the browser as an
unresolved promise and nothing plays.

## A generated file is never email-protected

`saveGeneratedAsset` in `src/server/video/asset-factories/media.ts` writes
`emailProtectedAt: null` on the row it inserts. The shell sets that date only
once a newsletter has gone out carrying the file, and it blocks deleting the
file after that, so a picture the app has just made is always free to delete.
