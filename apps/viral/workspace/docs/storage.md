# Storage clean-up

Every Analyse with AI and Save to vault keeps a full copy of the video in
Viral's storage. Settings → Storage shows the space those copies use and has
one button that deletes the copies nobody has opened for 30 days. Tyler,
4 Nov 2026: "Button only", so nothing is ever deleted on its own
(`src/components/viral/settings/storage-settings.tsx`,
`src/server/viral/storage.ts`).

## What the page shows

- **Every copy.** How many saved videos still have their file, and the space.
- **Kept by the vault.** The copies a vault idea points at. The button never
  touches these.
- **Not opened for 30 days.** What the button would delete now.

## What counts as opened

- **Opening it.** The right panel reading a saved video stamps
  `viral_videos.last_opened_at` (`markSavedVideoOpened`, called from the
  saved video's read in `src/lib/api/viral/viral-videos.ts`).
- **Never opened.** A copy nobody opened counts from the day it was saved.

## What the button does

1. Asks first, saying how many copies go and how much space comes back.
2. Takes the file off each saved video that is still unopened and not kept
   by the vault. A video opened a moment before keeps its copy.
3. Deletes each file from the media library and the bucket, once nothing in
   Viral uses it (`media-in-use.ts`).

The saved video itself stays, with its breakdown and analyses, so it still
shows in its projects and plays from YouTube or TikTok. Downloading it again
makes a new copy. Each person only ever sees and deletes their own copies.
