# The project page

Each project has its own three-panel dashboard at `/admin/projects/<id>`,
copied from Promo's project page (Tyler, 21 Nov 2026: "Copy the pattern of
the promo app instead"; `apps/promo/workspace/docs/projects-dashboard.md`,
"A project's own page"). The project's page on the left, what it found in
the middle, and the open video on the right. It is drawn on the shell's
three-panel design (`.agents/skills/Design/admin-3-panel-design/SKILL.md`).
The YouTube keywords are in the middle header, and Socials and the vault
are on the left (Tyler, 21 Nov 2026: "keep the keywords moved to the middle
but creators, vaults, and socials are not"). The creators moved to a tab in
the middle the same day (Tyler, 21 Nov 2026: "Move the creators block into
the middle tab here"), which replaces the earlier words for the creators
only.

## The left panel: the project's page

Code: `src/components/viral/project-page-panel.tsx` and
`project-page-blocks.tsx`, with the page's rules in
`src/lib/viral/project-page.ts`.

- **The header:** the collapse button, the name (cut short with "…", all of
  it on hover), and the ⋮. The arrow back to the Viral dashboard starts the
  middle's header, as Promo's does.
- **The cover** lies faintly behind the header and the top of the panel,
  and carries on behind the right panel's header. It is the one picked under
  Cover photo in the ⋮, or, with none picked, the best result's thumbnail
  from the last search.
- **The page** is the project's notes, written in the shell's editor and
  saved 700ms after the last letter (`viral_projects.notes`). It starts with
  a line to write in, kept above the blocks, because the editor puts no
  cursor above a block at the very top (Tyler, 21 Nov 2026, pointing above
  Socials: "I cant click here for the editor"). It holds:
  - **Socials**, fixed at the top, as Promo's Networks block: each social the
    project uses on one line, its mark and name, Paused while paused, and its
    new videos in the pill. Pressing one keeps the middle to it
    (`?social=`) and opens its first video; pressing it again shows every
    social. The picked one is dark with the sliding bar.
  - **Vault**, fixed under it, as Promo's Archive block: All ideas, with its
    count.
  - The two fixed blocks are never in the "/" list, can't be deleted, are
    put back if a save lost them, and move with Move up and Move down.
- **A page from before the blocks** keeps what was written, with Socials and
  Vault put above it.
- **The creators and the X, Reddit and LinkedIn lists are in the middle**,
  not on the page (Tyler, 21 Nov 2026: "Move the creators block into the
  middle tab here", then of the X and Reddit blocks: "these belong in the
  middle panel"): the Creators tab, and each social's Sources dropdown. A
  page that still holds one of those old blocks loses it when read.

## The ⋮

The shell's tabbed menu (`project-menu.tsx`), every row saving itself.

- **General:**
  - **Page:** Cover photo, the shell's row: None, Sky, each picture it has
    had, and + from the media library (`viral_projects.cover_url`,
    `cover_chosen` and `cover_images`). Lock blocks is the tab's footer, as
    Promo's Lock description is; locked, the page reads only, blocks and
    all, until unlocked (`viral_projects.notes_locked`).
  - **Project:** Name and Your topic. Your topic is not on the left panel
    (Tyler, 4 Nov 2026: "remove this from the left panel"); it is also set in
    the New project window and changed for one video in the Analyse box.
  - **Search:** Niche first, then Posted within (7, 30 and 90 days, 6
    months and 1 year), Country, Language, Videos, Minimum views and Minimum score. Country and
    Language each open a list you can type into, with Anywhere first (Tyler,
    6 Nov 2026: "Every country + language").
    - **Niche** is the description, moved here from the left panel and
      named for what it does (Tyler, 21 Nov 2026: "The discription should
      be in the 3 dots dropdown here and it needs better clarification",
      then "because it belongs to search isnt it?"): the kind of videos to
      find. The AI suggests keywords from it and scores how well each video
      fits it, the Fits column. Changing it clears those scores until the
      next search. Your topic is different: what you make, which every
      script is written for.
  - **AI:** Spend limit.
  - Then Pin, Duplicate, Archive, and Delete project in red, which asks first
    and says what goes.
- **Socials,** as Promo's Networks tab: each social the project uses, with
  Pause (or Check daily again) and Take off, which the server refuses while
  it still holds keywords or creators; then the socials it doesn't use, each
  a row to add it.

## The middle panel: what the socials found

- **One header** (the Admin 3 panel design, "Middle panel"). From left to
  right: the button that brings a shut left panel back, the arrow back to the
  Viral dashboard (its Projects, with this project shown on the right), the
  tabs, "N
  selected" while rows are ticked, the search box, Select, Filter, Views,
  Keywords, "+ Add", a ⋮ when a channel is hidden, and the button that
  brings a shut right panel back. Every button but + Add has the outline
  look. On a narrow middle the tabs give way first and scroll sideways, and
  the buttons drop their words.
- **Tabs.** Videos, Hooks, Sounds and Creators, each with a count. Downloaded and
  Analysed were tabs until 21 Nov 2026 (Tyler, 19 Nov 2026: "This is too
  many tabs. We dont need analyzed and downloaded its own tab when it can be
  sectioned or filtered"); they are Filter's Show now.
  - **Hooks** lists the opening line of each analysed video. Clicking a line
    plays the video from that moment.
  - **Sounds** lists the TikTok sounds under the videos, most winners first
    (`finding-content.md`). With no video open, the tab opens the top
    sound's first video on the right, or the picked sound's, so the right
    panel is never empty. A picked sound's name and its back arrow take the
    tabs' place in the one header.
  - **Creators** lists the YouTube and TikTok creators behind the results
    and the ones followed, most hits first, on the shell's table: picture,
    name, Following or Paused, the social's mark and handle, then
    Subscribers, Hits, Typical score, when the watch timer last checked, and
    the New posts switch for a followed creator. The columns drop as the
    middle narrows. It shows only for a project with YouTube or TikTok, and
    a social picked in the Socials block narrows it to that social's.
    - **The header** searches creators by name, and Filter holds their
      Subscribers from and up to. There is no Select and no Views. Follow a
      creator is in + Add.
    - **A row opens the creator page** below, their videos in the middle
      (Tyler, 21 Nov 2026: "clicking on the creators row lead to the videos
      view"). **The eye** in the action column shows the creator on the
      right and leaves the list in place (21 Nov 2026: "add eye"), as the
      Viral dashboard's Projects rows do. Its back arrow returns to Creators, with that creator open on
      the right (`?open=platform:channel`). With none open, the first is.
- **Filter** opens 384px wide, so every picked value shows whole (Tyler,
  21 Nov 2026: "the filter dropdown to be wider so the text can show"), with Show first on Videos: All videos,
  Downloaded and Analysed, each with its count (`?show=`). An old link with
  `view=downloaded` or `view=analysed` opens Videos with Show set to match.
  Then come Sort by and Order, From, Fits the topic, Keyword and Followers,
  then Show as (List or Grid) and, for the grid, Card size. Show as lives in
  Filter so the tabs fit beside the buttons (Tyler, 4 Nov 2026: "middle
  header alignment is wrong").
- **Views** are the shell's saved views, and keep Show too.
- **Keywords** (Tyler, 21 Nov 2026: "keep the keywords moved to the middle").
  A dropdown with the number of YouTube keywords, shown only while the
  project has YouTube. It lists each keyword and how its last search went; a
  keyword narrows the list to the videos it found, its arrow searches it
  again, and its × takes it off. Under the list sit Add keywords and Search
  all (`src/components/viral/keywords-dropdown.tsx`).
- **The ⋮** last in the header lists the hidden channels, each with Show
  again. It shows only while a channel is hidden.
- **The list** is the shell's table: grey titles that turn dark while pointed
  at and while open, the sliding bar before the open video, and grey chips.
  - **Columns** Score, Rising, Views, Outlier, Fits, Views a day, Posted and
    Length drop out as the middle narrows, each only once there is room for
    every column before it, so the table never runs past its panel. Each one
    sorts when its heading is clicked.
  - **New and dimmer.** A video nobody has opened says New; an opened one's
    title is grey (`finding-content.md`).
  - **The channel's name** under a title opens the creator page, when the
    channel is one this project knows.
  - **The Outlier badge** reads "40x usual". Its hover names the typical
    video's views.
  - **Nothing left** by the search or a filter says "No video matches" with
    Clear filters.
- **Right-click** a video for Select, Break it down, Download with no AI, and
  Hide the channel.
- **"+ Add"** opens a menu of Add a keyword, Follow a creator and Paste a
  link.
  - **Add a keyword and Follow a creator** turn the same dropdown into a
    one-field form.
  - **Paste a link** opens its window.
  - **Add a keyword** is left out when the project has no YouTube.
- **Select** comes right after the search box. Hooks has none, because
  nobody ticks a list of words. Ticked rows can be broken down, downloaded or
  have their channels hidden. Shown as Downloaded or Analysed, ticked rows can
  also be deleted.
- **The creator page.** Tyler, 4 Nov 2026: "In the middle panel". A row on the
  Creators tab, or clicking a channel's name,
  turns the middle panel into that creator's page (`?creator=`).
  - **The top** has their picture, followers, typical video's views, and
    how often a recent video doubles it, such as "Doubles their usual 1 time
    in 3". Doubling is the Outlier badge's bar
    (`channelUsual` in `src/lib/viral/outlier.ts`).
  - **The list** is the channel's videos in this project, sorted like the
    main list, then any newer uploads read from the channel.
  - **The back arrow** returns to the list as it was.
  - Code: `src/components/viral/creator-summary.tsx`.
- **The same idea.** "Same idea, other creators" in the right panel's ⋮
  turns the middle panel into the other creators' versions (`?same=`), with
  a back arrow and Search again (`finding-content.md`).
- **The vault** is not one of Research's lists. A video or post saved to
  the vault shows on the Projects dashboard's Vault, which lists every
  project's ideas or one project's (Tyler, 27 Nov 2026: "vault dont belong
  here").
- **Winning ads**, Meta's ad library search, was removed on 27 Nov 2026
  (Tyler: "Remove winning ads feature"), with Settings → Meta and its tables
  (`drizzle/0258_viral_winning_ads_removed.sql`).
- Code: `src/components/viral/viral-project-screen.tsx`, `video-grid.tsx`,
  and `hook-board.tsx`. The route is
  `src/routes/_authenticated/admin/projects_.$projectId.tsx`.

## The right panel: the open video

- **A creator's panel** has their name, social and handle in the header,
  then their numbers; the picture and name repeated under the header were
  taken off (Tyler, 21 Nov 2026: "remove this").
- **Every right panel** (the video, an idea, a post, a creator, an ad) draws
  the left page's cover behind its header, as one picture (Tyler, 12 Nov
  2026: "always connect right panel to the left panel bg"), ends its header
  with the collapse button, and has the shell's tabbed ⋮ (General: the
  record's rows, then its actions, then the red one under a line). With
  nothing open it says what will show there.
- **The header.** It has the social's mark, the title and channel, and a ⋮.
  The channel's name opens the creator page. The ⋮ holds Open on YouTube,
  Copy link, Copy to another project, Download with no AI, Download to
  computer, Same idea, other creators, Hide the channel, and Delete the saved
  video. Download to computer shows only once Viral keeps a copy, and saves
  the file named after the title (Tyler, 6 Nov 2026: "Both ⋮ menus";
  `vault.md`).
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
  score), Details (with the TikTok sound when known), Top comments, the four
  pieces, Notes, and each part of the breakdown. Numbers also shows Since
  yesterday, the views gained or the Rising badge. Each folds and remembers it in this browser.
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
- **A vault idea** opens in `vault-item-panel.tsx`, which the Viral
  dashboard's Vault row also uses, in the shell's record frame. A video idea
  shows the kept copy first. Then come cards: Idea (Tags, Notes), The post for a saved post, Numbers from when it was
  saved, with your own posts' views under them, and the analysis. An idea
  with no video has no player. Send to Video and Post for Promo share its
  sticky footer (`promo-connection.md`). Its ⋮ holds Status as a row, then
  Open on the original, Copy link, Copy to another project, Download to
  computer while Viral keeps a copy, and Delete from the vault. The Script card's pencil edits the script
  (`vault.md`).

## X, Reddit and LinkedIn posts

Picking X, Reddit or LinkedIn in the Socials block turns the middle and right
panels into that social's posts (`src/components/viral/text-socials.tsx`).

- **The middle.** The one header: "X posts" with a count, then the search
  box, Filter and Views, as every list of records has (UI standard). Each row is the writer, the
  subreddit for Reddit, the day, the words, and the numbers in that social's
  own words. Reddit says upvotes and comments, and LinkedIn says reactions.
- **Search** looks in the words, the title, the writer and the subreddit. It
  is the same `?q=` the videos' search uses.
- **Filter** holds Sort by, Order (highest or lowest first, newest or oldest
  first for Newest), and the fewest likes a post may have, in the social's
  word: at least 10, 100, 1k, 10k or 100k. A post whose likes are hidden is
  left out while that is set. Clear empties the likes row and leaves the sort.
  All three live in the address (`?psort=`, `?pdir=`, `?pmin=`), and picking
  another social clears them. A filter that hides the open post leaves it open.
- **Views** are saved per project in a kind of their own (`viral-posts`), so
  the posts' menu never lists a video view. A view keeps its social, the
  search, the sort, the order and the likes row, and opening one picks its
  social (`src/lib/viral/text-posts.ts`).
- **Sources**, beside Views, as Keywords sits on the videos (Tyler, 21 Nov
  2026: "these belong in the middle panel"): the button shows how many
  searches, accounts or subreddits Promo reads on this social for the
  project, and opens them, each with how its last read went, its arrow to
  read it again and its cross to take it off (`projects-and-socials.md`).
  Add to X sits under the list.
- **The sorts.** Newest, then each number the social shows, biggest first.
  X has Views, Likes, Replies and Reposts. Reddit has Upvotes and Comments.
  LinkedIn has Reactions, Comments and Reposts. A post missing the number goes
  last either way round. The list opens on Views for X and on the likes figure
  for the others.
- **The first post opens on arrival**, so the right panel is never empty.
- **The right panel is the thread.** The header has the social's mark, the
  writer, and the day, with a ⋮ holding Open on X, Copy link and Copy the
  text. Under it come folding cards: The post, with any link it carries;
  Numbers, with the writer's followers; then Top replies, or Top comments,
  in order.
- **Replies not read yet.** The first time a post opens, Promo is asked to
  read it with its replies, and the card says "Promo is reading the thread".
  The replies arrive when Promo finishes; the page asks every 20 seconds.
- **The sticky footer.** Save to vault sits under the scrolling body, as on a
  video's right panel. It opens a dropdown with what the AI writes, its
  price with the writer's name, and Save and write. Once the post is in the
  vault it says "In vault · save again". A sample's posts are refused with a
  sentence and no AI (`vault.md`).

## Narrow screens

Below 1280px the three panels become one at a time, under pills reading
Project, Videos and Video, Vault and Idea, or Posts and Post. These are the shell's
`ThreePanels`.
