# The Projects list and the project page

Tyler picked Travel's trip page as the pattern for Viral on 4 Nov 2026. The
project page copies it: the project on the left, what it found in the
middle, and the open video on the right. A project's settings live in a ⋮
menu, not a window.

## The Projects list

`/admin/projects` is a table of projects, with pinned ones first. It has
folders, search, Pin, Archive, Duplicate and Delete, all copied from Video's
Viral list.

- **New project** opens a window with four fields. Name. Your topic, the
  one line every script is written for, such as "a meal-prep course for busy
  dads"; its hint says so (Tyler, 4 Nov 2026: "dont know what this is"). A description, which
  the AI reads to suggest keywords and judge fit. Socials, with YouTube and
  TikTok both ticked.
- **Keywords are optional.** The keywords card shows only while YouTube is
  ticked, because only YouTube is searched by keyword.
- **The cog on a row** opens the project, because the settings are in its ⋮.
- Code: `src/components/viral/viral-projects-page.tsx` and
  `viral-project-dialog.tsx`. The route is
  `src/routes/_authenticated/admin/projects.index.tsx`.

## The left panel: the project

- **The header.** It has the back arrow to the list, the name, the notes
  icon, and the ⋮.
- **The banner.** The project's cover lies faintly behind the top of the
  panel. The cover is the one picked under Cover photo in the ⋮, or, with
  none picked, the best result's thumbnail from the last search. A picked
  cover stays through searches (`viral_projects.cover_chosen`, added by
  `drizzle/0100_viral_project_cover.sql`). The sample project has a stretching
  photo of its own, because its made-up videos have no thumbnails.
- **Your topic is not on the left panel** (Tyler, 4 Nov 2026: "remove this
  from the left panel"). It is set in the New project window, changed in the
  ⋮ under Your topic, and changed for one video in the Analyse box.
- **The notes icon.** It bends into an × while the project's notes replace
  the panel's body. The notes are written in the shell's editor and save
  700ms after the last letter. They are kept in `viral_projects.notes`,
  added by `drizzle/0099_viral_project_notes.sql`, as the editor document
  cleaned to what the shell's written-page rules allow.
- **The ⋮ holds the settings.** Cover photo, Name, Your topic, Posted within, Videos,
  Minimum views, Minimum score and AI spend limit are folding rows, and each
  one saves itself. Under a line are Duplicate, Archive and Delete project.
  Delete asks first and says what goes.
- **The body.** First the description, written in
  place. Then come these cards:
  - **Socials.** Each social is a row with Pause and an ×, and + adds a
    missing one. Picking a row keeps the middle panel to that social
    (`?social=`). Pick it again to see every social.
  - **The Vault row.** It shows the count and opens the project's vault in
    the middle.
  - **YouTube keywords.**
  - **One creators card per social,** each with Add creator.
- Code: `src/components/viral/project-details-panel.tsx`, `project-menu.tsx`,
  `keywords-card.tsx` and `creators-card.tsx`.

## The middle panel: what the socials found

- **Tabs.** Videos, Downloaded, Analysed and Hooks, each with a count.
  - **Analysed** lists videos that Analyse with AI has written about.
  - **Hooks** lists the opening line of each analysed video. Clicking a line
    plays the video from that moment.
- **The ⋮ after the tabs.** It shows the hidden channels, each with Show
  again.
- **The toolbar.** From left to right: the "N selected" button while rows are
  ticked, Mass select, search, Filter, Views, and "+ Add".
  - **Filter** opens with Sort by and Order. Then come From, Fits the topic
    and Keyword, then Show as (List or Grid) and, for the grid, Card size.
    Show as lives here rather than in the header so the four tabs and their
    ⋮ fit beside the toolbar (Tyler, 4 Nov 2026: "middle header alignment is
    wrong").
  - **Views** are the shell's saved views.
- **The list's columns.** Score, Outlier, Fits, Views, Views a day, Posted
  and Length. Each one sorts when its heading is clicked.
  - **The Outlier badge** reads "40x usual". Its hover names the typical
    video's views.
- **"+ Add"** opens a menu of Add a keyword, Follow a creator and Paste a
  link.
  - **Add a keyword and Follow a creator** turn the same dropdown into a
    one-field form.
  - **Paste a link** opens its window.
  - **Add a keyword** is left out when the project has no YouTube.
- **Mass select.** The "Mass select" chip sits in the middle header's
  toolbar, after "N selected" and before the search, as Travel's trip page
  has it. It shows while the header is pointed at, and always on a phone.
  Hooks has none, because nobody ticks a list of words. Ticked rows can be
  broken down, downloaded or have their channels hidden. On Downloaded and
  Analysed, ticked rows can also be deleted.
- **The vault.** With the Vault row picked, the middle panel lists the
  project's ideas and the right panel shows the open one. The first idea
  opens on arrival. Its header has the same Mass select as the Vault page.
- Code: `src/components/viral/viral-project-screen.tsx`, `video-grid.tsx`,
  `hook-board.tsx` and `vault-list.tsx`. The route is
  `src/routes/_authenticated/admin/projects_.$projectId.tsx`.

## The right panel: the open video

- **The header.** It has the social's mark, the title and channel, and a ⋮.
  The ⋮ holds Open on YouTube, Copy link, Download with no AI, Hide the
  channel, and Delete the saved video.
- **What is said comes first under the player** (Tyler, 4 Nov 2026: "the
  what is said card should be under video and clicking on the text takes me
  to that part of the video"). Clicking a line plays from it: the kept copy
  moves to that moment, and a YouTube video not yet downloaded reloads its
  player starting there and plays. Instagram's and TikTok's players can't
  start part way, so their lines aren't clickable until the video is
  downloaded.
- **Everything under the player is a card** (Tyler, 4 Nov 2026: "all these
  should be in cards"): Numbers (Views, Likes, Comments, Outlier, Engagement,
  which is likes and comments for every 100 views, Per follower, then the
  score), Details, the four pieces, Notes, and each part of
  the breakdown. Each folds and remembers it in this browser.
- **The analysis.** While the AI works, a loading line shows in the body.
  - **The four pieces.** Why it works, Script, More ideas, and Title and
    hashtags. Each is a folding card with its own Copy button.
  - **Notes** sit under the pieces and save when the box is left.
- **The sticky footer.** Analyse with AI, Save to vault and Send to Video
  always sit in one row in a footer under the panel's scrolling body (Tyler,
  4 Nov 2026: "this should be in the sticky footer", "all 3 buttons in one
  row"). In a narrow panel they show their icons alone, each named in its
  tooltip; once the footer is 320px wide, their words show too.
  - **Analyse with AI** opens a dropdown with the topic, which can be changed
    for this video only, the price, and the button that runs it. There is no
    Analyse card in the body any more ("remove the card since we dont need
    it").
  - **Send to Video** needs a vault idea, so on a video not yet in the vault
    it saves it first, then opens the picker (see `send-to-video.md`).
- **The breakdown.** Once the AI has watched the video, its breakdown comes
  last.
- Code: `src/components/viral/player-panel.tsx`, `analyse-section.tsx`,
  `analysis-cards.tsx` and `send-to-video.tsx`.
- **A vault idea** opens in `vault-item-panel.tsx`, which the Vault page
  also uses. It shows the kept copy, then cards: Idea (Status, Tags, Notes),
  Numbers from when it was saved, and the analysis. Send to Video is in its
  sticky footer.

## Narrow screens

Below 1280px the three panels become one at a time, under pills reading
Project, Videos and Video, or Vault and Idea. These are the shell's
`ThreePanels`.
