---
name: Video port — creators, creator watch, viral archive and templates
status: todo
---

**What this is.** The research half of the app: a creators directory with automatic watching for new posts, the viral archive (save any TikTok/Instagram/YouTube video, download it, have AI break down why it works), and reusable video templates — including the studio's template-builder and fill-template modes. Sits on tasks 01, 02 and 04.

**The use case.** Follow the creators worth studying and get told when they post; save a video that's working, read its AI breakdown (hook, problem, solution, call-to-action); turn the good structure into a template and fill it with new footage in minutes.

**Why it's a good idea.** This is the loop that feeds the editor with ideas and structure instead of a blank page. It comes late because it stands on everything before it: media (01), the editor's template modes (02), and metered AI analysis (04).

**No automations — deliberately.** ai-video wired creators and ingest into its automation system; automations are not being ported. Creator watch here is exactly one thing: a timer that checks followed creators and sends a notification. The `creator_posted` automation trigger, the ingest/create-project automation steps and the approval checkpoint stay behind — do not rebuild them. Behaviour reference: `apps/ai-video/src/server/{creators,creator-watch,creator-avatars,trend-score,viral-videos,video-download,video-analysis,video-templates}.ts`, dashboards `creators-dashboard.tsx`, `viral-archive-dashboard.tsx` + `viral-video-modal.tsx`, `templates-dashboard.tsx` + `template-settings-dialog.tsx`, `pages/creators/creator-detail-page.tsx`. yt-dlp and ffmpeg must exist on the host; name them plainly in errors when missing.

## Tasks:

- **Tables.** `video_creators`, `video_viral_videos`, `video_templates` in `src/server/video/schema.ts` + the next free `00NN_video_research.sql`, media rows in the shell library. Acceptance: commented migration; a viral video row survives its creator being deleted (kept, unlinked — deletion says so). Verification: `npm run db:setup` + PGlite replay.
- **Creators.** Dashboard + detail page (`/admin/video-creators`): add by profile link (the profile-URL parsing has ported tests), avatar via a session-checked binary route, follower counts, trend score (views-per-day velocity). Acceptance: a malformed profile link is refused with a plain message, never a crash. Verification: ported tests green + add a real creator in the browser.
- **Creator watch.** A scheduler behind `VIDEO_WATCH_ENABLED=1` registered through task 01's boot-hook door: on its tick, check watched creators for new posts and send a notification through the seam proven in task 04, respecting a per-person on/off preference for this notification type. Acceptance: with the flag unset nothing runs; a new post notifies once, never repeatedly. Verification: flag on locally, watch a creator, see exactly one notification per new post.
- **Viral archive.** Paste a link → download via yt-dlp (size cap from `VIDEO_MAX_DOWNLOAD_BYTES`), thumbnail extraction, then metered AI analysis producing a transcript and labeled segments (hook/problem/agitation/solution/proof/cta/other); dashboard with the detail modal showing the breakdown beside the video. Acceptance: a failed download or analysis leaves a row with a readable error and a retry, never a half-imported ghost. Verification: archive one real video end to end.
- **Templates.** Templates dashboard (`/admin/video-templates`), template settings dialog, thumbnails; the studio's template-builder mode (mark slots in a timeline) and fill-template mode (swap slot media, everything else locked) — this is where the Slots panel from the studio arrives; "create template from viral video" building a template skeleton from the labeled segments. Acceptance: filling a template can only touch slot contents. Verification: build a template from a viral video and fill it, in the browser.
- **Server functions.** `src/lib/api/video/{creators,viral,templates}.ts`, all guarded and zod-validated. Acceptance: `guards.test.ts` green. Verification: `npm run test` and `npx tsc --noEmit -p tsconfig.app.json` against the pre-existing error list.

## Rules

- Follow the UI rules at workspace/docs/ui-rules.md
- Use .agents/skills/audit-change to follow coding standards
- Don't make assumptions — if something is unclear, stop and ask instead of guessing
- Validate browser-facing work with .agents/skills/validate-app against the server already running on this app's port from local-apps.json; never start another

## The Review Checklist

[ ] Brief in plain english
[ ] Edge cases handled
[ ] Error paths handled
[ ] Update documents (if applicable)
[x] Add brief and what you changed below.

## Brief
