# Send to Video

Send to Video puts a vault idea into the Video app as a draft. Tyler, 4 Nov
2026: "Send to Video button", "Draft + script + original". The code is
`src/server/viral/video-sends.ts` and `video-link.ts`. Video's side is
`apps/video/workspace/docs/viral-connection.md`.

## Setting it up

1. On Video's Settings → Viral, make a key. It starts with `vv_` and belongs
   to the Video admin who made it.
2. On Viral's Settings → Video connection, fill in Video's address and paste
   the key. Both save themselves, and the key is kept scrambled.
   - **Whose key it is.** Viral also keeps who pasted the key
     (`viral_settings.video_key_owner_id`, `drizzle/0106_viral_video_key_owner.sql`).
     Video's calls back act only for that person. News about someone else's
     send changes nothing, and someone else's file link answers "No such
     file". A key saved before Viral kept the owner has none, so Video's calls
     are refused until the key is pasted again.
3. Press Test. It tells Video this Viral's address, the only address Video
   will fetch files from or call back, and says whose Video answered.

## What a send does

- **The picker.** It lists that Video admin's own projects that are not
  archived. It opens on the Video project this Viral project sent to last.
- **What Video gets.** A new draft video with the analysis's title, the
  script as its notes, your notes, a link back to the idea in Viral's Vault,
  and the original video. Video copies the original into the project's Media.
- **Sent.** The idea turns Sent and gets an Open in Video link. The link is
  kept only when it is on the Video address saved on Settings → Video
  connection. Any other link Video answers with is dropped, and the button
  doesn't show.
- **Sending again.** An idea sent before asks first. Replace swaps the words
  and the file on the same draft. Send as new makes another draft.

## When something fails

- **Video says no.** Viral keeps Video's sentence as the send's reason, and
  the idea stays unsent.
- **The copy fails.** Video deletes the new draft, so the idea stops saying
  Sent.
- **A Replace fails.** Video keeps the old draft, so the idea still says
  Sent.
- **Stuck at sending.** A send that never got Video's answer, because the
  server stopped in the middle, turns failed two minutes later, the next time
  the progress line asks. Send to Video then works again.
- **News about a finished send.** Once a send is ready or failed, Video's
  news about it changes nothing. "Arrived" naming a different draft than
  Video first answered with changes nothing either.
- **Try again.** Try again always makes a new send. Video answers a send id
  that failed before with "failed already".
- **Too big.** Video refuses files over 200 MB, or that aren't videos. Viral
  refuses over 200 MB before it asks.

## The messages

Every message carries the key as `Authorization: Bearer <key>`, both ways.
Viral checks the key before it reads Video's news, then refuses news longer
than 20,000 characters by what really arrived, not by what the sender's
`content-length` claims (`readCallBody` in `src/server/viral/video-link.ts`).

- **Viral → Video `POST /api/connect/viral/hello`** `{ viralUrl }`: Test.
  The answer is `{ name, projects }`.
- **Viral → Video `GET /api/connect/viral/projects`**: the picker's list.
- **Viral → Video `POST /api/connect/viral/drafts`**:
  `{ sendId, projectId, title, script, notes, vaultItemUrl, viralProjectName, file, replaceVideoId? }`.
  - `file` is `{ token, name, contentType, size }` or null.
  - The answer is `{ videoId, editUrl, status }`, at once. The copy happens
    after.
- **Viral → Video `GET /api/connect/viral/sends/<sendId>`**: how a copy is
  doing, as `copying`, `ready` or `gone`. Viral asks at most every 20
  seconds.
- **Video → Viral `GET /api/connect/video/file/<token>`**: the file itself.
  - Both the key and the token are needed.
  - The token is 32 random bytes, and only its hash is kept.
  - It opens one send's file, for two hours or until the send arrives.
- **Video → Viral `POST /api/connect/video/events`**:
  `{ type: "arrived", sendId, videoId, editUrl }` or
  `{ type: "failed", sendId, error }`.

## Not proven

These have been tested with Video stubbed. No send has gone between the two
running apps yet.
