# Projects and socials

A Viral project is one niche you are researching. Everything else hangs off
it: the socials, their keywords and creators, the videos found, the
analyses and the vault.

## What a project holds

- **The topic.** The New project window asks for Your topic, one line such
  as "a meal-prep course for busy dads". Every analysis writes its script for
  this topic. The topic can be changed in place on the left panel, or in its
  ⋮ under Your topic. The Analyse box can change it for
  one video only (`viral_projects.topic`).
- **The notes.** A written page behind the notes icon in the left panel's
  header (`viral_projects.notes`, `drizzle/0099_viral_project_notes.sql`).
- **The socials.** A list in the order they were added
  (`viral_projects.socials`). The New project window ticks both YouTube and
  TikTok by default.
- **The filters and limits copied from Video.** Days searched (7, 30 or 90),
  video length, minimum views, minimum score, and the AI spend limit. All
  of them are rows in the left panel's ⋮ and save as they change
  (`project-page.md`).

## Socials are modules

Tyler, 4 Nov 2026: "add socials (like modules see promo app)". This copies
Promo's networks (`apps/promo/workspace/docs/network-modules.md`).

- **The list.** `src/lib/viral/socials.ts` lists only the socials Viral has
  built: YouTube and TikTok. "+ Add social" never offers one that does
  nothing, and the server refuses any other name.
- **What each social does.** YouTube is searched by keyword and its creators
  are followed. TikTok has creators only, because nothing free searches
  TikTok by keyword (Tyler: "Creators only for TikTok").
- **Adding one.** `addViralSocial` puts it at the end of the list. Adding one
  the project already has is refused.
- **Pausing one.** `setViralSocialPaused` keeps it on the project, but the
  daily re-check and the creator watch skip it until it is resumed.
- **Taking one off.** `removeViralSocial` is refused while the social still
  holds keywords or followed creators, and the refusal says how many, such
  as "YouTube still has 2 keywords in this project."
- **Keywords need YouTube.** Adding a keyword to a project without YouTube is
  refused. Following a creator is refused unless the project has that
  creator's social.

## Instagram, X and Threads

These three are not socials yet (Tyler: "YouTube + TikTok only first").
Reading an Instagram profile has failed everywhere since October 2026, so an
Instagram creator can't be followed. A single Instagram reel can still be
pasted as a link (see `finding-content.md`).

## The sample project

A new account gets one sample project the first time its Projects list
opens (`ensureSampleViralProject`). It has made-up results, one analysed
video and two ideas in the vault, so every panel has something in it. It
never searches or calls an AI. Deleting it never brings it back, because
`viral_sample_made` remembers it was given. A sample added again by hand
takes over the made-up saved video the first one left behind.

## Where it lives

- Server: `src/server/viral/projects.ts`.
- Server functions: `src/lib/api/viral/viral-projects.ts`, including
  `changeViralSocial` and `saveViralProjectTopicFn`.
- Tables: `viral_projects` and the rest in `src/server/viral/schema.ts`,
  made by `drizzle/0098_viral_research.sql`.
