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
  built: YouTube, TikTok, X, Reddit and LinkedIn. "+ Add social" never offers
  one that does nothing, and the server refuses any other name.
- **What each social does.** YouTube is searched by keyword and its creators
  are followed. TikTok has creators only, because nothing free searches
  TikTok by keyword (Tyler: "Creators only for TikTok"). X, Reddit and
  LinkedIn find posts, read by Promo (below).
- **The New project window** ticks YouTube and TikTok. X, Reddit and LinkedIn
  start unticked, because they need Promo connected first.
- **Adding one.** `addViralSocial` puts it at the end of the list. Adding one
  the project already has is refused.
- **Pausing one.** `setViralSocialPaused` keeps it on the project, but the
  daily re-check and the creator watch skip it until it is resumed.
- **Taking one off.** `removeViralSocial` is refused while the social still
  holds keywords, followed creators, or things it reads on X, Reddit or
  LinkedIn. The refusal says how many, such as "YouTube still has 2 keywords
  in this project." or "X still has 1 thing it reads in this project."
- **Keywords need YouTube.** Adding a keyword to a project without YouTube is
  refused. Following a creator is refused unless the project has that
  creator's social.

## X, Reddit and LinkedIn

Tyler, 4 Nov 2026: "Ask Promo to read them". Viral never signs in to these
three. Promo reads them with its own search accounts and its Reddit reader,
through the connection on Settings → Promo connection (`promo-connection.md`).

- **What each one reads.** The kinds come from what Promo can read
  (`PROMO_READ_KINDS_BY_NETWORK`):
  - **X:** searches, hashtags and accounts.
  - **Reddit:** searches and subreddits. A subreddit is its top posts of the
    week.
  - **LinkedIn:** searches, hashtags, people and companies.
- **One card per social.** The left panel has "X searches and accounts",
  "Reddit searches and subreddits" and "LinkedIn searches and people". Add to X
  opens a choice of what to read and a field. Adding one keeps it and asks
  Promo to read it at once.
- **How each one stands.** A row's second line says what it is and how its
  newest read went: "Promo is reading it", "12 found · Nov 4", or Failed with
  Promo's own words, such as having no X search account. A watch has no state
  of its own. Its newest read in `viral_promo_reads` with the same network,
  kind and value says how it stands (`src/server/viral/social-watches.ts`).
- **The same one twice.** "r/Fitness" and "fitness" are one subreddit, and
  "@dad" and "dad" one account, so adding it again is refused.
- **Promo not connected.** The social's row in the Socials card says "Promo
  not connected", and its card links to Settings → Promo connection. A watch
  added then is kept, and read once Promo is connected.
- **Read again and remove.** The arrow on a row asks Promo to read it again
  now, refused while its last read still waits. The × takes it off with the
  posts only its reads brought.
- **The watch.** The `viral-social-watch` worker asks Promo to read searches,
  hashtags and subreddits again once a day, and accounts, people and
  companies every 6 hours, the same as YouTube keywords and followed
  creators. It asks for 5 reads a tick, oldest first. It skips samples,
  archived projects and paused socials, and does nothing while Promo isn't
  connected. A read Promo never answered within 2 hours is asked for again.
  It runs only with `VIRAL_WATCH_ENABLED=1`.
- **A duplicated project** copies what it reads, not the posts found.
- **Not built for posts.** A post can't be analysed with AI or saved to the
  vault, because both work from a video file.

## Instagram and Threads

Neither is a social. Reading an Instagram profile has failed everywhere since
October 2026, so an Instagram creator can't be followed. A single Instagram
reel can still be pasted as a link (see `finding-content.md`). Threads can't
be read because Promo has no Threads.

## The sample project

A new account gets one sample project the first time its Projects list
opens (`ensureSampleViralProject`). It has made-up results, one analysed
video, three ideas in the vault (Idea, Scripted and Posted, so the board has
cards), two made-up Winning ads, one saved format on Library → Formats, and
X and Reddit with two X searches and accounts, one subreddit and three
made-up posts whose replies are already in, so every panel has something in
it (`src/server/viral/sample-socials.ts`). It
never searches or calls an AI. Deleting it never brings it back, because
`viral_sample_made` remembers it was given. A sample added again by hand
takes over the made-up saved video the first one left behind.

## Where it lives

- Server: `src/server/viral/projects.ts`.
- Server functions: `src/lib/api/viral/viral-projects.ts`, including
  `changeViralSocial` and `saveViralProjectTopicFn`.
- Tables: `viral_projects` and the rest in `src/server/viral/schema.ts`,
  made by `drizzle/0098_viral_research.sql`. What a project reads on X, Reddit
  and LinkedIn is `viral_social_watches`, made by
  `drizzle/0104_viral_text_socials.sql`.
- X, Reddit and LinkedIn: `src/server/viral/social-watches.ts`, server
  functions in `src/lib/api/viral/viral-socials.ts`, screens in
  `src/components/viral/text-socials.tsx`.
