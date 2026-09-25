# Your own backgrounds and sounds

A Pro member uploads their own picture, clip or sound loop, and it appears in
the picker beside the eight that ship with the app. Free accounts see the strip
with the button locked and a line saying why.

## What is allowed

| Kind | Types | Largest |
| --- | --- | ---: |
| Picture | PNG, JPG, WebP | 10 MB |
| Sound | MP3, WAV, OGG | 30 MB |
| Video | MP4, WebM | 100 MB |

Two gigabytes per person in total, counted across every file the account owns,
because every file sits in one bucket and the number a member is shown has to be
the number that runs out. The limit itself comes from the plan
(`storageLimitBytes` in the Pro perks), so a plan can change it without a code
change.

Three refusals, each with a plain sentence rather than a code:

- **The bytes do not match the claim.** A text file renamed to `.png` is turned
  away. The browser's file type is only what the operating system guessed from
  the extension, so the first bytes of the file are what the server believes.
- **It is too big**, against that kind's limit.
- **It is the wrong kind for the picker.** A background takes pictures and
  video; a sound takes audio.

A request that never says how big it is is refused before a byte is read. That
is how a chunked upload arrives, and its size cannot be checked until the whole
body is already in memory, which is the hole it would otherwise open.

## What happens to the file

A picture is finished the moment it lands. Sound and video are queued, and the
`pomodoro-media-uploads` worker re-encodes them on the shell's fifteen-second
loop, one per pass:

- **Video becomes 720p with no sound at all.** A background is scenery and the
  sound player owns audio. A 1920x1080 clip with an AAC track came back 1280x720
  with no audio stream, and 104 KB became 48 KB.
- **Sound becomes a 192 kbps MP3, loudness-normalised**, so picking a new loop
  does not blow your ears off at the volume the last one was comfortable at.

One upload per pass on purpose: FFmpeg is the most expensive thing this app
does, and a queue of videos must not hold the room clock behind it. Ten uploads
take ten passes, about two and a half minutes.

While that runs the card says "Getting it ready…" and cannot be picked, because
the file behind it is still the raw original. The page asks again every four
seconds, and only while something is actually waiting. A re-encode that fails
goes back in the queue twice; after that the card says so in words instead of
spinning forever. A server with no FFmpeg says "This server cannot prepare sound
or video yet. Tell an operator."

## The strip waits before it lets you press anything

The upload button starts shut on every visit and opens only once the server has
said whether this account may upload. Every screen in the product hydrates in
the browser — guests have no server session, so no page under `_pomodoro` has a
route loader — and for a signed-in member this strip therefore asks for its
list, the Pro answer and the space used in one request when the page opens.

**A guest is never asked for.** The layout already knows whether anybody is
signed in (`useProductAuth`), so the strip reads that instead of asking the
server, which would answer 401 and put a red "Please sign in again." on a page
that was working perfectly well. A guest gets a settled, quiet answer: the
button is shut and the line under it says to sign in on a Pro plan.

Treating "not known yet" as allowed was a bug: on a free account you could open
the file picker by clicking quickly, and the upload was then refused by the
server a moment later. The right answer, arrived at the wrong way round. The
padlock and the tooltip also wait, so a paying member is never briefly told that
uploading is a perk they do not have.

## Where the files live

In the shell's own media library (the `media` table) and its R2 bucket, exactly
like every other file this app stores. Rebuilding that plumbing would give the
app a second place to look for a file.

`pomodoro_media_uploads` (migration 0091) is the part the shell knows nothing
about: which library files belong to the pomodoro app, what the member meant
each one for, and how the re-encode is getting on. `media_id` is its primary
key, so one library file is at most one pomodoro upload and deleting the library
row takes the job row with it.

**Uploads are served straight from the bucket's public address**, which is what
`serializeMedia` hands out for every other file in the app. The app also has an
owner-checked route at `/api/v1/media/<id>/file`, and it is not used here: Vite's
dev server refuses to forward a request an `<img>` made to a Nitro handler, so
that route 404s in development while working in production, and having two ways
to fetch one file is worse than having one.

The preference still stores `media:<uuid>`, never an address. The server
resolves the address when it loads the preference and hands it to the browser,
so a deleted or half-prepared upload simply comes back without one and the
backdrop falls back to the default scene.

## Picking, and deleting

Picking an upload saves `media:<uuid>` the same way picking a scene saves
`scene:<key>`. The server checks the upload is **theirs** and **ready** before
saving it; without that check the address bar could put somebody else's media id
in the row.

Deleting removes the bucket object, both rows and any preference pointing at it,
in one go. The confirmation says so. If it was the background you were using,
you go back to Lofi girl rather than to a blank screen.

The bucket object is deleted after the rows, not before, so a bucket that
refuses leaves a file with no row — which the storage page's orphan sweep picks
up — rather than a row pointing at a file that is gone.

## Where the code lives

- `src/lib/pomodoro/media-limits.ts` — the sizes, types and wording, in one
  browser-safe file, so the size a member is told about is the size the server
  enforces.
- `src/server/pomodoro/media-uploads.ts` — the byte sniffing, the cap, the
  library rows and the job queue.
- `src/server/pomodoro/media-transcode.ts` — the FFmpeg arguments, ported from
  the old app's worker.
- `src/server/pomodoro/media-worker.ts` — one job per tick, registered in
  `src/app/server-options.ts`.
- `src/lib/api/pomodoro/media-uploads.ts` — three server functions, all guarded.
- `src/components/pomodoro/media-uploads-section.tsx` — the strip both pickers
  use.
