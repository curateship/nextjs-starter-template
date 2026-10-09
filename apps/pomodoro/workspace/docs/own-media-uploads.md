# Your own backgrounds and sounds

A Pro member uploads their own picture, clip or sound loop, and it appears in
the picker beside the eight that ship with the app.

## The "Your own" card

On both `/sounds` and `/backgrounds` the uploads sit in one card, drawn to
Tyler's Sounds design of 7 Oct 2026: a "YOUR OWN" heading with the space used
beside it ("4.3 MB of 2.0 GB"), two buttons, the file limits under them, and
the uploads in a grid once there are any.

- **Two buttons, no drop box.** Tyler, 7 Oct 2026: "remove the upload box
  ... Clicking the button is enough." Sounds has Upload sound and Generate
  with AI. Theme has Upload clip and Generate with AI. Dragging a file onto
  the page does nothing.
- **Upload opens the file picker**, limited to the types that page takes.
- **Generate with AI scrolls to the generator card** further down the same
  page, and puts the cursor in its prompt when the prompt is open to you
  (`useGeneratorJump` in `src/lib/pomodoro/use-generator-jump.ts`).
- **Upload is never dead.** A guest sees Sign in in its place. On a free
  account it shows a padlock and opens the plans. On a full account it says
  to delete something first, in the line under the buttons. While the page is
  still asking, it shows a spinner.

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

**The page turns a file away before it uploads when it already knows the
answer.** Picking a file over its kind's limit, or bigger than the space left,
shows the reason at once where upload errors appear, and nothing is sent: "This
clip is 150 MB. Clips can be up to 100 MB." or "This clip is 50 MB and you have
40 MB of space left." (`uploadRefusal` in `media-limits.ts`). The kind comes from
the browser's file type, image, audio or video. A file the browser could not
type gets only the space check, and the server judges it by its bytes. The
server checks the same numbers again and has the last word, so the browser
check is a courtesy and never the rule. A 150 MB clip used to upload for a
minute before being refused.

A request that never says how big it is is refused before a byte is read. That
is how a chunked upload arrives, and its size cannot be checked until the whole
body is already in memory, which is the hole it would otherwise open.

## The upload counts up

While a file goes up, the Upload button reads "Uploading… 40%", and once every byte is
out it reads "Checking the file…" while the server sniffs and stores it. A 100
MB clip on slow wifi used to show a spinner for minutes, with no way to tell
slow from stuck.

- **The same server function sends it.** `fetch` cannot report upload progress,
  so `uploadPomodoroMedia` hands the server function a `fetch` built on
  `XMLHttpRequest` (`fetchWithUploadProgress` in
  `src/lib/api/pomodoro/media-uploads.ts`). The address, the origin check, the
  cookies and the error codes are the ones every other call uses, and refusals
  still go through `getPomodoroUploadErrorMessage`.
- **A screen reader hears it in quarters**: "Uploading, 25%", 50, 75, then
  "Uploaded. Checking the file." Reading every percent aloud would talk over
  everything else.
- **There is no cancel button.** Closing the page is the only way to stop one.

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
spinning forever. A server with no FFmpeg says "Sound and video cannot be
prepared yet." The production worker image has FFmpeg only when it is built
with `WORKER_PACKAGES=ffmpeg`, which Pomodoro's Coolify worker resource must
set (the repo's `docs/deployment.md` explains the argument). The website image
never has it, because the website never re-encodes anything.

## The button waits before it lets you press anything

The Upload button starts shut on every visit and opens only once the server has
said whether this account may upload. Every screen in the product hydrates in
the browser — guests have no server session, so no page under `_pomodoro` has a
route loader — and for a signed-in member this strip therefore asks for its
list, the Pro answer and the space used in one request when the page opens.

**A guest is never asked for.** The layout already knows whether anybody is
signed in (`useProductAuth`), so the strip reads that instead of asking the
server, which would answer 401 and put a red "Please sign in again." on a page
that was working perfectly well. A guest gets a settled, quiet answer: a Sign
in button and a line saying to sign in on a Pro plan.

Treating "not known yet" as allowed was a bug: on a free account you could open
the file picker by clicking quickly, and the upload was then refused by the
server a moment later. The right answer, arrived at the wrong way round. The
padlock and the tooltip also wait, so a paying member is never briefly told that
uploading is a perk they do not have.

## The bell

A video or sound that had to be converted says in the bell when it is ready,
with its file name, or that it could not be prepared, with the same reason the
picker shows. Only giving up says anything; a retry does not. An upload the
member deleted before it was converted says nothing. See
[Notifications](notifications.md).

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

## Admins can delete a member's file

`/admin/pomodoro-uploads` lists every background and sound members uploaded
or had made by AI (admin task 06, 8 Oct 2026). Each row shows a small preview,
the owner, whether it is a background or a sound, the size, and whether it is
in use. Sounds play from the row's play button.

- **"In use" names where.** A file can be the owner's room background, their
  room sound or their profile banner. Those are the only places a member's own
  file can be chosen.
- **Delete works on one row or on every ticked row**, in one request. The
  admin delete puts the owner back exactly where their own delete would: a
  room background goes back to Lofi girl, a room sound to silence, a profile
  banner to none.
- **The shell's admin delete removes the file.** That is `deleteMediaAsAdmin`,
  the same one the shell's Media page uses. It refuses a file that was used
  as a logo in a sent email, and the line afterwards counts that file as kept.
- **The member is not told.** The file simply leaves their picker.
- **One log row per press** in `pomodoro_audit_logs`, resource
  `member_uploads`, naming every file that went.
- **Clicking the owner's name** opens their member window, and `?user=<id>`
  shows one member's files.

## Where the code lives

- `src/server/pomodoro/admin-uploads.ts` — the admin list and delete, behind
  `src/lib/api/pomodoro/admin-uploads-tags.ts`; the page is
  `src/components/pomodoro/admin-uploads-dashboard.tsx`.
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
