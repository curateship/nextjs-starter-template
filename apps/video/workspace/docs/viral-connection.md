# Send to Video from Viral

The Viral app's Send to Video makes a draft video in one of your Video projects. The draft carries the script the AI wrote, your notes and a link back to the vault item. The original viral video comes too and goes on the project's Media shelf, as a reference to copy from (Tyler, 4 Nov 2026: "Draft + script + original"). The task is `apps/viral/workspace/tasks/viral-research/01-viral-research-app.md`, parts 21 and 22. Viral's side is in Viral's `workspace/docs/send-to-video.md`.

## Setting it up

- **Video makes the key.** On Settings → Viral, press Make a key, then Copy. Each admin has their own key, and drafts sent with it land in that admin's projects.
- **Viral keeps the key and Video's address** on its Settings → Video connection.
- **Test in Viral tells Video where Viral is.** Video only fetches the original from, and only calls back to, the Viral address that last pressed Test. Settings → Viral shows that address and when it last checked in.
- **A new key ends the old one at once.** Settings → Viral asks first, because Send to Video in Viral stops until the new key is pasted there.
- **The key stops working** when its admin is no longer an active admin.

## What a send makes

- **A new draft** in the picked project, named after the vault item's title, or the script's first line when there is no title.
- **Its script, notes and vault link** are kept on the video. The Videos tab shows "From Viral:" and the script's first line under its name, and the whole script on hover.
- **The script fills the Templates panel's script box** until something else is typed there, so a template can be picked and Brief to video pressed straight away ([templates.md](templates.md)).
- **The vault link is kept only when it is on the Viral address Test saved.** Any other link, or one that isn't a web address, is dropped and the draft has none.
- **The original video** is fetched once from Viral, kept in the media library like an upload, and put on the project's Media shelf.
- **The bell rings** for the draft's owner: "Meal prep in 30 seconds arrived from Viral", from the Viral project's name. With the original coming too, it rings once the file is in.
- **The same send twice makes one draft.** Viral gives every send its own id, and Video answers a repeat with the first draft.

## Replace

- **Replace sends a newer version to the same draft.** The script, notes and vault link change, and the new original goes on the Media shelf.
- **The old original comes off the shelf** unless the draft's timeline already uses it. It stays in the media library either way.
- **The words wait for the file.** If the new original fails to arrive, the draft keeps its old words and file.

## When the original doesn't arrive

- **A new draft is deleted**, so sending again from Viral starts clean. Viral is told why, and the send shows as failed there.
- **Video refuses** a file that isn't a video, one bigger than 200 MB, one that arrives a different size than Viral said, and any redirect.
- **A copy is given an hour.** A background job (`video-viral-arrivals`) ends one stuck past that, and starts one whose start was lost to a restart.

## The messages

Every call carries the key as `Authorization: Bearer <key>`. A wrong key gets 401. Each admin may send 600 messages an hour, and ask after sends 6,000 times an hour.

- **Viral → Video `POST /api/connect/viral/hello`** `{ viralUrl }`: Test. Video keeps Viral's address and answers `{ name, projects }`.
- **Viral → Video `GET /api/connect/viral/projects`**: `{ projects: [{ id, name }] }`, the key's admin's own projects that aren't archived, newest first.
- **Viral → Video `POST /api/connect/viral/drafts`** `{ sendId, projectId, title, script, notes, vaultItemUrl, viralProjectName, file: { token, name, contentType, size } | null, replaceVideoId? }`: answers `{ videoId, editUrl, status: "copying" | "ready" }` at once, and copies the original after.
- **Video → Viral `GET /api/connect/video/file/<token>`**: the original, fetched once with the key.
- **Video → Viral `POST /api/connect/video/events`**: `{ type: "arrived", sendId, videoId, editUrl }` or `{ type: "failed", sendId, error }`.
- **Viral → Video `GET /api/connect/viral/sends/<sendId>`**: `{ status: "copying" | "ready" | "gone", videoId?, editUrl? }`. Gone means the copy failed.

## Where the code is

- `src/server/video/viral-link/link.ts`: the key, checking a caller, and calling Viral back.
- `src/server/video/viral-link/arrivals.ts`: making the draft, copying the original, Replace and the sweep.
- `src/routes/api/connect/viral/`: the four addresses.
- `src/components/viral-link/viral-link-settings.tsx` and `src/lib/api/video/viral-link.ts`: Settings → Viral.
- Tables: `video_viral_links` (one key per admin) and `video_viral_arrivals` (one row per send), plus `viral_script`, `viral_notes` and `viral_vault_url` on `video_project_videos` (`drizzle/0153_video_viral_connection.sql`).
