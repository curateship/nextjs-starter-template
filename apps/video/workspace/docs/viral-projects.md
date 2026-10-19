# Viral projects

Viral is a list of projects, and each project is one niche. You describe the
niche, give it up to ten keywords, and press Search. The app asks YouTube for
the most-watched videos on each keyword, scores every one, and finds the
creators behind them. Viral and the old Creators page are now this one
dashboard, at `/admin/video-viral`. It is admin-only, because searching spends
the app's one YouTube allowance.

## The projects list

`/admin/video-viral` lists every project, pinned ones first, then the one
changed most recently.

- **Each row** shows the project's cover, its name, its keywords, how many
  videos it holds, how many YouTube units it has used and when it changed. A
  spinner beside the keywords means a search is still running, and the list
  reads itself again every 5 seconds until it finishes.
- **The cover** is the best-scoring video's thumbnail, picked when a search
  finishes. A project nobody has searched shows the Viral icon.
- **Folders** are Viral's own, kept apart from the editor's, so the two lists
  never mix. The folder dropdown and Move to folder work exactly as the
  editor's do (`project-folders.md`).
- **Pin, duplicate, archive, settings and delete** sit at the end of each row.
  Ticking rows offers Move to folder, Archive and Delete for all of them in one
  request.
- **Duplicate** copies the name with " copy" added, plus the description, the
  keywords, the filters, the spend limit and the hidden channels. It copies no
  results, so the copy has searched nothing until Search is pressed.
- **Delete** says what goes (the videos found, the hidden channels and the
  links to followed creators) and what stays (starred videos, saved
  breakdowns, editor projects made from it, and creators followed in other
  projects). The numbers are counted from the database when the window opens.
- **Add a sample project** shows only while the list is empty. It makes a
  made-up niche with 12 made-up videos, 3 keywords and 4 channels, so the
  screen can be tried with no YouTube key. Nothing outside the app is asked,
  the project says it is a sample, nothing in it plays, and Search on it is
  refused with a sentence saying why.

## Making a project

**New project** asks for a name, a description and the keywords.

- **Keywords** are typed as chips: Enter or a comma adds one. A project needs
  at least one and can have ten. A repeat is refused ignoring capitals, and so
  is anything over 100 characters.
- **Suggest keywords** sends the description to whichever AI is chosen for
  writing (`writing-with-ai.md`) and offers about eight keywords to tick. None
  repeats a keyword already in the list. It needs a description of at least a
  sentence. It is metered as `viral_keyword_ideas`, and from Project settings
  it counts against the project's spend limit.
- Creating a project searches nothing. It opens on the project screen, where
  Search is.

## The project screen

`/admin/video-viral/<project id>` is three panels, the same shape as the
editor: the project on the left, the videos in the middle, and the video you
picked on the right. Drag the dividers and the sizes come back next time.
Double-click a side panel's empty space to shut it, and a tab on the middle
panel's edge opens it again.

### The left panel

One grey card per group:

- **About:** the description.
- **Keywords:** one row per keyword with how its last search went: "Waiting
  to search", "Searching", "12 found Oct 17", or "Failed" with the reason. A
  keyword that found new videos shows "3 new". Clicking a keyword narrows the
  middle panel to the videos it found. The arrow searches that keyword again
  on its own. The cross removes it, after a window saying how many videos go
  with it. Below the rows: a box to add a keyword, the **Search every
  keyword** button, and a line with what a full search costs and how many of
  today's units are left.
- **Filters:** what the project asks YouTube for and which videos show, with a
  button to change them.
- **At a glance:** how many videos and creators, the best score, the typical
  views (the middle number of all of them), the YouTube units used and the
  AI spend.
- **Made from this:** every editor project Copy this made from this project,
  each one a link into the editor.

### The middle panel

Four tabs: **Videos**, **Downloaded**, **Broken down** and **Creators**. On a
phone the four are wider than the screen, so the row of tabs slides sideways.

The Videos tab has a grid of covers or a list of rows. Both choices and the
card size (small, medium or large) are remembered in this browser. The grid
and list switch sits at the end of the toolbar under the tabs, because four
tabs fill the header.

- Each card shows the cover (upright for a Short, wide for anything longer),
  the score, the length, a **New** badge, the title, the channel, the views
  and when it was posted.
- **A video being downloaded or broken down stands out** with an amber border
  and background, and an amber strip under its cover saying "Waiting…",
  "Downloading…" or "Watching it…". A video saved with Download alone stops
  being amber once its file is in, and carries a Downloaded chip. In the list its row is amber with the
  same words. It stays that way while you click other videos: the screen asks
  about every working video in one request every 3 seconds, stops asking once
  none is working, and reads the project again when one finishes so its new
  score shows. Tyler asked for this on 17 Oct 2026.
- **Sort** by score (the default), views, views per day, newest, or how well
  it fits the topic. In the list, the column headings sort too.
- **Search** narrows the videos by words in the title or channel name, on what
  is already loaded.
- **From** picks where the videos come from: the keyword searches, the
  followed creators' own uploads, or both.
- **Fit** hides videos the AI judged off-topic (below 40 or below 70). A video
  the AI has not judged yet is kept, so the filter never seems to remove
  something it never looked at.
- **Ticking videos** offers Download, AI analyse, Star and Hide their
  channels for all of them in one request each.

The **Downloaded** tab is the same list kept to the videos saved with
Download whose AI has not run, with the same search, sort, source and fit,
and its own count. Each card has its own **AI analyse** button, which moves
it to Broken down without downloading it again. Ticking videos there offers
AI analyse and **Delete**. Tyler asked for this tab on 18 Oct 2026. The
address keeps it (`?view=downloaded`).

The **Broken down** tab is the same list kept to the videos whose breakdown
has finished, with the same search, sort, source and fit, and its own count.
A video still being broken down is not in it yet; it is the amber card on the
Videos tab. Ticking videos there offers **Delete**, and no Download or AI
analyse, since both are done. Tyler asked for this tab on 17 Oct 2026. The
address keeps it (`?view=broken`).

Delete opens a window that lists the editor projects made from those videos
with Copy this, and says what happens to the downloaded files
(`creator-research.md`, "Deleting a saved video").

None of the sorting, searching or filtering asks the server or YouTube.

### The right panel

Picking a video plays it here.

- **Playing costs nothing.** A YouTube video plays in YouTube's own embed,
  through the no-cookie address so looking at research is not tracked. TikTok
  and Instagram show their cover and a button out to their own site. A video
  that was downloaded plays from the app's own copy instead.
- Under the player: views, likes and comments; the star; **Open on YouTube**;
  **Copy link**; **Delete** for a saved video; and **Hide** for the channel.
- **Why it scores N** lists the five parts of the score with the points each
  gave, such as "21.8 of 25", and what was missing. The score itself is in
  `viral-score.md`.
- **Copy this**, **Download** and **AI analyse** sit under the score, with a
  line above them saying only AI analyse spends AI money
  (`creator-research.md` for what each downloads and spends). A downloaded
  video shows AI analyse alone, with a line saying no AI has watched it yet.
  Pressed here, they remember this project: Copy this saves the project's id
  on the editor project it makes, and the breakdown's AI cost counts against
  this project's spend limit. Download spends no AI, so a spend limit never
  refuses it.

### The address

Everything you would want back after a reload is in the address: the tab, the
playing video (`?video=youtube:<id>`), the picked creator, the sort, the
search words, the source, the keyword and the fit. A reload or a shared link
opens the same thing. An address naming a video that is no longer in the
results drops it quietly instead of showing an error.

### On a phone

Below 1280 pixels wide, the left and middle panels stack and the page scrolls.
Tapping a video opens the right panel as a sheet over the grid. Closing it
leaves the grid exactly where it was.

## Searching

Pressing **Search every keyword** does not wait for YouTube. It marks the
keywords as waiting, and a background worker searches them one at a time
(`src/server/video/viral/project-search.ts`, registered as
`video-viral-search`). The screen reads the project again every 3 seconds
while any keyword is waiting, so the videos arrive as each keyword finishes.
You can keep browsing, close the tab, or come back later.

### What it costs

YouTube gives the app's key 10,000 free units a day, and the day restarts at
midnight Pacific time.

- One keyword is **102 units**: the search is 100, one batch of the videos'
  numbers is 1, one batch of their channels' subscriber counts is 1. A search
  that finds nothing stops at 100.
- A project of 5 keywords costs 5 × 102 = **510 units**.
- A project set to both Shorts and longer videos runs two searches per
  keyword, so one keyword is 204 units.
- Searching one keyword again, or adding a keyword, costs that keyword only.

### The allowance check

Before anything is queued, the whole run is priced against what is left of
today's units, counting keywords already waiting anywhere in the app. If the
whole run does not fit, nothing starts and the sentence says how many
keywords would fit. For example, with 9,700 units already used, 300 are left,
and a 5-keyword search is refused with "room for 2 of these 5 keywords (204
of the 510 units)".

The app counts every YouTube call it makes in `video_youtube_unit_spend`:
searches, looking at a channel's uploads, following a YouTube creator, and
the watch timer. YouTube never says how many units are left, so this count
can only be lower than YouTube's own, for example when the same key is used
somewhere else. That is why YouTube's own "used up" refusal is still caught
and worded on the keyword.

### One keyword failing

Each keyword is its own job. A keyword that fails keeps the reason, shows it
in red under the keyword, and keeps the videos it found last time. Every
other keyword still finishes. A worker that stops halfway (a restart, a
deploy) leaves its keyword claimed for 2 minutes at most, after which it goes
back in the queue.

### What a search replaces

A keyword's search replaces that keyword's videos and no other keyword's. A
video two keywords found is one card naming both. Removing a keyword takes
away the videos only it found.

### The New badge

A video is new when the project did not have it before that keyword's search
started: not from another keyword, and not from this keyword last time.

- The very first search of a project marks nothing new, however many keywords
  it has.
- A keyword added to a project that was already searched marks the videos the
  project did not have.
- The badge clears the next time that keyword is searched, not on a reload.

### Shorts or longer videos

Project settings choose **Shorts** (3 minutes or less, the default), **Longer
videos**, or **Both**. YouTube's own "short" filter means under 4 minutes, so
for Shorts the app also drops anything over 180 seconds. For longer videos it
asks for any length and drops everything 180 seconds or under.

### How on-topic each video is

When the last waiting keyword of a run finishes, the AI is asked once how well
each new title fits the project's description, from 0 (a fishing video found
by "hooks") to 100. The numbers are stored on the results, so a title is never
asked about twice, and a look at the screen never calls the AI. At most 150
titles go in one call. A project with no description is skipped. It is metered
as `viral_topic_match` and counts against the project's spend limit. If the AI
is refused or has no key, the matches stay blank and the search itself
stands.

## Filters and settings

The cog in the left panel's header opens **Project settings**:

- **The niche:** name and description.
- **What YouTube is asked for:** posted within the last 7, 30 or 90 days (30
  by default), and Shorts, longer videos or both. Changing either means the
  videos on screen follow the old settings, so after saving the screen offers
  to search every keyword again and says what that costs.
- **Which videos show:** minimum views and minimum score. These apply to what
  is already found, so changing them costs nothing and the grid changes at
  once.
- **Spending:** the AI spend limit in dollars, the same rule as an editor
  project's (`project-first.md`). Keyword ideas, the topic match and
  breakdowns pressed in this project count. YouTube units are free and are
  not counted here.
- **Hidden channels:** each one with **Show again**.

## Creators

The Creators tab lists every channel behind the project's results, plus every
creator followed in the project, most hits first.

- **Hits** is how many of the project's videos are theirs. **Typical** is the
  middle score of their videos.
- **Subscribers from** and **up to** narrow the list, for example to creators
  with 10,000 to 500,000 subscribers. A creator whose count is hidden only
  shows with no range set.
- **Picking a creator** fills the middle panel with their newest uploads and
  shows their card on the right: picture, subscribers, hits, how often they
  post, Follow or Unfollow, their profile and Hide. Picking one of their videos
  plays it, and the arrow in the player's header goes back to their card.
- **A followed creator's uploads** come from what the app already saved and
  cost nothing. **Anyone else's** are asked of YouTube for 2 units, and only
  YouTube channels can be looked at without following them.
- **How often they post** is videos a week over the last 4 weeks. With fewer
  than 3 posts known it says "Not enough posts yet".
- **Check for new posts** is a switch on each followed creator's row, with
  "Last checked 2 hours ago" beside it. Switching it off pauses the watch
  timer for that creator in every project they are in, because a creator is
  stored once (`creator-research.md`, "Pausing one creator"). Creators found
  only through the search have neither, because the timer never checks them.
- **Follow** adds them to this project. A YouTube creator's 10 newest uploads
  are read at once, so the grid has them before the watch timer's next turn.
- **Add a creator** takes a profile link, for somebody the search did not
  find. TikTok creators' videos arrive when the watch timer next checks.
  Instagram creators can be added but never get videos, because Instagram
  refuses the app's requests (`creator-research.md`).

### One creator in several projects

A creator is stored once per person and linked to each project they are in,
so the watch timer checks them once. Unfollowing in one project keeps them in
the others. Unfollowing in the last project they are in unfollows them for
good, and their saved breakdowns stay.

### Hiding a channel

Hide, from a card's player, a creator's card or ticked videos, takes that
channel's videos and its creator entry out of this project only. Every other
project still shows it. Project settings list the hidden channels with Show
again.

## Favourites

The star on a video opens a small menu of your collections: tick one or more,
or make a new one.

- **Starring only bookmarks.** It is free, downloads nothing and runs no
  breakdown.
- **A collection is yours and shared across every project.** It can hold
  videos from any project. Names are unique per person, ignoring capitals.
- **A starred video keeps its own copy of its details.** A search that
  replaces a keyword's results, or deleting the project it came from, never
  empties a collection.
- **Deleting a collection** deletes the collection and its stars. No video,
  result or breakdown goes.
- **Favourites has its own page**, `/admin/video-favourites`, linked in the
  left menu as a sub-link of Viral (Tyler, 17 Oct 2026: "favorite is a subnav
  of viral"). It opens
  the first collection, at `/admin/video-favourites/<id>`, in the same three
  panels: the collections on the left, its videos in the middle, the player
  on the right. With no collection yet it says how to start one. Taking the
  star off there takes the video out of that collection.
- **Migration 0115** put the link in every left menu that has Viral, as
  Viral's first sub-link. Where Viral is itself a sub-link, the menu has no
  third level, so Favourites goes straight after it. A menu that already has
  the link is left alone.

This replaced viral task 14, Named shortlists.

## Copy this and the editor

Copy this from a Viral project makes an editor project that remembers both
the video and the Viral project (`video_projects.source_viral_project_id`).
The project shows under **Made from this** on the left. In the editor, the
Copy panel's **Open Viral** opens that Viral project with the copied video
playing. A project copied from anywhere else, or whose Viral project was
deleted, opens the list instead. Deleting either project never deletes the
other.

## What moved when Viral became projects

Migration `0114_video_viral_projects.sql` did this once, on 17 Oct 2026:

- **Saved searches from the old one-keyword Viral page** became one project
  per person called **Earlier searches**, every keyword kept with its results
  and its units. The old search tables were dropped.
- **Each creator folder** became a project with the folder's name and its
  creators. Anyone followed but in no folder went into a project called
  **Followed creators**. The folder tables were dropped. Saved and broken-down
  videos never belonged to a folder, so they stayed as they were.
- **The Creators link** left every left menu, matched by its address.
  `/admin/video-creators` now sends you to `/admin/video-viral`.

## Deployment

- Migrations 0114, 0115, 0116 and 0121 must run on the live database. 0114
  moves the old searches and folders as above, 0115 adds the Favourites link,
  0116 adds the saved covers, and 0121 adds the Downloaded status and the title
  a deleted video leaves on projects copied from it (`creator-research.md`).
- The background search worker runs wherever the app's worker loop runs. It
  only ever searches keywords somebody queued after the allowance check.
- The YouTube key is the one in Settings → YouTube (`viral-search.md`).
