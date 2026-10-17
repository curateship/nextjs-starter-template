# Big video uploads

A video up to 5GB can go into the media library. The browser cuts it into
10MB pieces and sends each piece straight to the R2 bucket, so the file never
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

## The ceiling is 5GB

`VIDEO_MAX_BYTES` in `src/lib/media/media-upload.ts`. The browser and the server
both read that one number.

- **Why 5GB:** an iPhone filming 4K at 60 frames a second writes about 400MB a
  minute, so 5GB is roughly 12 minutes of the heaviest footage a phone makes.
  That is a long take for a clip somebody means to edit.
- **Why not more:** R2 itself takes files up to 5TB, so the bucket is not the
  limit. Video renders its exports from these files, copying each one onto the
  render server's disk first, and a bigger source only means a slower render
  and a fuller disk. Raising it later is that one number.
- **The database already fits it.** `file_size` is a `bigint`, so a file over
  2GB stores its true size.

## The journey of one video

1. **Start.** The browser asks the server to open an upload, giving the file's
   name, type and size. The server checks those against the ceiling and the
   list of video types, picks the file's key (`<owner id>/<uuid>_<name>`),
   asks R2 to open an upload under it and says how many pieces to send.
2. **Pieces.** For each piece the browser asks the server for a signed address
   that is good for one hour and for a piece of exactly that piece's size,
   then sends the piece to it. Four pieces travel at
   once. A piece that fails is sent again, up to three tries, each with a fresh
   address. `src/lib/media/upload-in-parts.ts` does this.
3. **Finish.** The browser hands back the receipt R2 gave for each piece. The
   server asks R2 to join them, then checks the joined file the way a
   one-request upload is checked: the type and size R2 reports, and the first
   bytes, which must look like the video type claimed. Only then is the library
   row added. `src/server/media/video-upload.ts` does this.

The browser's word counts for nothing at the finish, because the server never
saw the bytes. A file that fails a check is deleted, and so is one whose row
will not save.

**One upload can never put more than 5GB in the bucket, finished or not.**
Each address is signed for one piece's exact size, at most 10MB, and R2
refuses a body of any other length; the browser sets that length from the
bytes and a page cannot change it. The server signs at most 512 pieces, which
is what a 5GB file needs. Without this somebody signed in could have sent 5GB
to every one of the 512 addresses, never finished, and left 2.5TB sitting in
the bucket until R2's seven-day cleanup.

**Every step after the start is checked against the person asking.** The key
must be the asker's own id and one file name, so nobody can sign, finish or
cancel somebody else's upload, or write into a folder such as `favicons/`.

## Progress

- **Media library page:** the toolbar reads "Uploading beach.mov, 42%", or
  "1 of 3 uploaded, beach.mov at 42%" when several files were picked. The
  number moves as the bytes leave the browser.
- **Media picker window:** the button reads "Uploading, 42%".
- **Pictures and sound show no percent.** They go in one short request, which
  reports nothing until it is done. The page keeps its "1 of 3 uploaded…"
  count for those.

## Failing safely

- **Cancel.** The library page has a Cancel button beside the progress while
  anything is uploading. In the picker, the × beside the file does the same,
  and so does closing the window. Cancel tells R2 to throw away every piece
  sent so far, so the key never becomes a file and no row is written. Files
  in the same batch that were already finished stay.
- **An image already going up finishes first.** It is one short request, so
  Cancel stops the batch after it.
- **Leaving the library page cancels too**, and closing the tab asks first
  while an upload is running, because a big video starts again from nothing.
- **Pieces from a tab that was closed anyway.** Unfinished pieces never show
  in a bucket listing, so the orphan scan never sees them. R2 deletes them on
  its own seven days after the upload was opened, which is the default rule on
  every R2 bucket. No row ever pointed at them.
- **A failed upload cleans up the same way as a cancel.** The browser asks the
  server to throw the pieces away whatever went wrong.

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
