# Big video uploads

A video up to 5GB can go into the media library, and an app can raise that:
Video takes files up to the bucket's own 5TB. The browser cuts the file into
pieces and sends each piece straight to the R2 bucket, so the file never
passes through the app's server. Pictures and sound still go in one request to
the server, as before.

## Why videos go a different way

- **One request was the wrong shape for a big file.** The server read the
  whole upload into memory before passing it to the bucket, and Cloudflare in
  front of the app refuses any request over 100MB. That was the old ceiling,
  whatever the code said.
- **Pictures stay on the old path on purpose.** The server cleans every SVG
  before storing it (`sanitizeSvgContent` in `src/server/media/library.ts`),
  which it cannot do to bytes it never sees. Pictures are capped at 10MB and
  sound at 50MB, so one request is fine for both.
- **One switch decides.** `uploadMedia` in `src/lib/api/media/media.ts` sends
  any video type in pieces and everything else in one request. The one-request
  server function refuses a video outright, so there is one path per kind of
  file.

## The ceiling is 5GB unless the app says otherwise

`videoMaxBytes()` in `src/lib/media/media-upload.ts`. The browser and the server
both read it.

- **Each app sets its own.** `media.videoMaxBytes` in the app's
  `src/app/options.ts` is a number of bytes, or `"bucket"` for the most R2
  keeps in one file, 5TB less 5GB. Unset is 5GB. Video says `"bucket"`, from
  Tyler on 31 Oct 2026: "Don't have upload limit. File can be as big as 100gig
  or more", for Video only. Every other app keeps 5GB.
- **Why 5GB is the default:** an iPhone filming 4K at 60 frames a second writes
  about 400MB a minute, so 5GB is roughly 12 minutes of the heaviest footage a
  phone makes.
- **The refusal names the ceiling** through the shared size formatter, so it
  reads "Maximum size is 5 GB" in an app on the default.
- **The database already fits it.** `file_size` is a `bigint`, so a file over
  2GB stores its true size.

## How big the pieces are

The bucket joins at most 10,000 pieces into one file, so the piece grows with
the file. `videoUploadPartBytes` works it out.

| File | Piece | Pieces |
| --- | ---: | ---: |
| 25MB | 10MB | 3 |
| 5GB | 10MB | 512 |
| 100GB | 11MB | 9,310 |
| 500GB | 52MB | 9,847 |

A piece is 10MB until about 97GB, then the smallest whole number of megabytes
that keeps the count at 10,000 or under. The sizes count 1GB as 1,024MB, the
way the screen does, which is why 100GB comes to 9,310 pieces of 11MB rather
than a round 10,000 of 10MB.

## The journey of one video

1. **Start.** The browser asks the server to open an upload, giving the file's
   name, type and size. The server checks those against the ceiling and the
   list of video types, picks the file's key (`<owner id>/<uuid>_<name>`),
   asks R2 to open an upload under it and says how big the pieces are and how
   many to send. The browser remembers the key (see "Picking up where it
   stopped").
2. **Pieces.** For each piece the browser asks the server for a signed address
   that is good for one hour and for a piece of exactly that piece's size,
   then sends the piece to it. Four pieces travel at
   once. A piece that fails waits 3 seconds, then 6, and is sent again, up to
   three tries, each with a fresh address, so a few seconds of dropped wifi do
   not end the upload. `src/lib/media/upload-in-parts.ts` does this.
3. **Finish.** The browser hands back the receipt R2 gave for each piece. The
   server asks R2 to join them, then checks the joined file the way a
   one-request upload is checked: the type and size R2 reports, and the first
   bytes, which must look like the video type claimed, and the size must be
   the size the browser said at the start. Only then is the library row
   added. `src/server/media/video-upload.ts` does this.

The browser's word counts for nothing at the finish, because the server never
saw the bytes. A file that fails a check is deleted, and so is one whose row
will not save.

**One upload can never put more than the ceiling in the bucket, finished or
not.** Nothing is stored between the steps, so every step after the start
repeats the file size the start was told, and the server checks it against
the ceiling each time. It then signs only the pieces that size needs, each for
its exact size; R2 refuses a body of any other length, and the browser sets
that length from the bytes, which a page cannot change. Stating a different
size partway through gains nothing: the most it can get is pieces for a file
of the ceiling's size, which stating the ceiling honestly at the start gets
anyway. Without the per-piece size somebody signed in could have sent the
ceiling to every one of the addresses, never finished, and left that many
times over sitting in the bucket until R2's seven-day cleanup.

**Every step after the start is checked against the person asking.** The key
must be the asker's own id and one file name, so nobody can sign, finish or
cancel somebody else's upload, or write into a folder such as `favicons/`.

## The upload line

Uploads live in one app-wide list in the browser tab,
`src/lib/media/upload-queue.ts`, not inside the page that started them. The
shell layout draws that list as the upload line,
`src/components/media/upload-line.tsx`, in the bottom right of every signed-in
page.

- **Moving around the app no longer stops an upload.** Leaving the Media
  library, or Video's editor, leaves the file going, and the line goes with
  you. Closing the tab still asks first while anything is going up.
- **The line reads "Uploading beach.mov, 42%, about 18 minutes left at 12
  MB/s"**, with a bar under it. A picture or a sound file reads "Uploading logo.png" with no
  number, because it goes in one short request that reports nothing until it
  is done.
- **The time left is the speed over the last 30 seconds**, not since the
  start, which would never notice the wifi getting faster, and not since the
  last reading, which jumps about because four pieces land together.
  `src/lib/media/upload-speed.ts` does the sum. It appears once two seconds
  have been measured, and it is redrawn at least once a second, because 1% of
  a 100GB file can take minutes.
- **Pause** (videos only) lets the pieces already in the air land, then starts
  no new ones. Resume carries on. The time left starts again after a pause,
  because the wait was not slowness. A piece's address is signed just before
  it goes, so a pause of hours still works.
- **Cancel** on the line (videos only) throws away every piece sent so far,
  so the key never becomes a file and no row is written. A picture or a sound
  file has neither Pause nor Cancel: one short request cannot be stopped part
  way.
- **The Admin dashboard's Media library** keeps a batch's count, "1 of 3
  uploaded", and a Cancel that stops the rest of the batch, beside its Upload
  button. The file
  going up now is on the line. One file shows only on the line.
- **Media picker window:** unchanged. Its button reads "Uploading, 42%", and
  closing the window cancels, because the window is waiting for that file to
  pick it.

## Picking up where it stopped

After a closed tab, a refresh or dropped wifi, picking the same file again
carries on from the last finished piece.

- **The browser remembers only the key.** `src/lib/media/upload-resume.ts`
  keeps the file's key and upload id in `localStorage`, under the file's name,
  size and last-changed time. A file edited since starts afresh.
- **The bucket says which pieces arrived.** Picking up asks the server, which
  checks the key is the asker's own and lists the pieces R2 holds
  (`listUploadedParts` in `src/server/media/storage.ts`). A piece of the wrong
  size is sent again rather than joined.
- **Six days.** R2 throws unfinished pieces away seven days after the upload
  opened, so the browser forgets an upload after six and starts afresh.
- **An upload that can no longer go on starts again**: one finished,
  cancelled, cleared by R2, or opened by somebody else on a shared computer.
- **A failed upload keeps its pieces.** The message ends "It stopped at 42%.
  Pick the same file again to carry on from there." Only Cancel throws the
  pieces away.

## Failing safely

- **An image already going up finishes first.** It is one short request, so
  Cancel stops the batch after it.
- **Pieces from an upload nobody came back to.** Unfinished pieces never show
  in a bucket listing, so the orphan scan never sees them. R2 deletes them on
  its own seven days after the upload was opened, which is the default rule on
  every R2 bucket. No row ever pointed at them.

## Storage used and its cost

The Media library's header reads "212 GB stored, about $3.18 a month", for
everybody's files or the one owner picked, once the middle is wide enough to
hold it. Pointing at it lists the parts.

- **The price is Cloudflare's $0.015 per GB a month**
  (`src/lib/media/storage-cost.ts`), so 100GB reads "about $1.50 a month". The
  first 10GB each month are free on Cloudflare's side and the figure leaves
  that out, so it is the most the files could cost.
- **Each file's own size** is in the list's Size column and in its window.
- **An app adds what it keeps beside the files** through `media.storageUsed`
  in its `src/app/server-options.ts`. Video adds its smooth copies.
- **The search and type filters do not narrow it.** It is what the bucket is
  billed for.

## Sending a file from disk

`uploadFileToR2` in `src/server/media/storage.ts` sends a file the server
already has on disk, such as a finished export, without reading it into
memory. Node refuses to hold more than 2GB in one piece of memory, so the old
`uploadToR2`, which takes bytes, failed on anything bigger.

- A file of one piece or less goes in one request.
- Anything bigger goes in the same piece sizes as a browser upload, four at a
  time, each read off disk just before it is sent. A piece gets three tries;
  after that the pieces already sent are thrown away.
- **Measured, 3 Nov 2026:** a made-up 3GB file went in 308 pieces to a fake
  bucket while the process's memory rose 160MB at its highest
  (`storage-disk-upload.test.ts`). Not yet run against the real bucket.

## The bucket rule that has to be set once

A browser may only send a piece to the bucket if the bucket says the site is
allowed to. That setting is called CORS, and it lives in Cloudflare, not in
this app. Without it every video upload fails with "the storage bucket does not
accept uploads from this site yet".

In the Cloudflare dashboard, open R2, then the bucket, then Settings, then
CORS policy, and paste:

```json
[
  {
    "AllowedOrigins": ["https://your-site.com", "http://localhost:3002"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- **AllowedOrigins** lists every address people upload from: each live
  domain, and each local port the app runs on. One bucket shared by several
  apps lists all of their addresses.
- **ExposeHeaders: ETag** is the part people forget. Without it a piece lands,
  but the browser cannot read R2's receipt for it, so the pieces cannot be
  joined. The error message says the same thing as for a missing rule, because
  both are fixed in this one place.
- **Only PUT is allowed.** Reading files goes through the public address as
  before and needs no rule here.

## Signed addresses

`signUploadPart` in `src/server/media/storage.ts` signs with
`requestChecksumCalculation: "WHEN_REQUIRED"`. Without it the Amazon library
puts a checksum in the address, worked out at signing time over no bytes at
all, which only matches an empty piece. R2 ignored it when this was built, and
leaving it out means nothing breaks the day it starts checking.

## Checked

- **Real R2, 17 Oct 2026.** A 25MB file went up in 3 pieces through signed
  addresses and joined at exactly its size. A second upload, cancelled after
  one piece, left no file behind.
- **The signed size holds.** An address signed for 1,000 bytes was refused
  with 5,000 bytes and with 10 bytes (R2 answered 403), and took exactly
  1,000.
- **A 2GB file** went up in 205 pieces in 95 seconds, from a process reading
  it off disk a piece at a time and signing its own addresses. The process
  used 159MB before the upload and 168MB at its highest, so memory rose by
  9MB for a 2,048MB file. The joined file was exactly 2,147,483,648 bytes.
- **The local `custom-shell` bucket has the rule** from 17 Oct 2026, for
  `http://localhost:3002`, `3014`, `3015` and `3016`. A check from 3002 passed
  and one from an unlisted port was refused. The bucket's own storage key may
  not change bucket settings, so the rule went in through Cloudflare's API with
  the account setup key in `~/.config/deploy-app/secrets.env`
  (`PUT /accounts/<account>/r2/buckets/<bucket>/cors`).
- **Each live app's bucket needs the same rule, with its live domains**, before
  this reaches production. Until then a video upload on the live site fails
  with the CORS message.
