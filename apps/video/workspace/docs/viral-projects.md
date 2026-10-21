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

`/admin/video-viral/<project id>` is a three-column dashboard, built on the
shell's pieces like every other one (the UI standard's "Three-column
dashboards", `docs/shell/three-column-dashboards.md`). The left panel holds the
project, its keywords and its creators. The middle holds the videos, and the
right holds the video or creator you picked. Drag the dividers and the sizes
come back next time. Double-click a side panel's empty space to shut it, and a
tab on the middle panel's edge opens it again.

**On arrival it goes back to where you were.** Opened from the left menu or
the projects list, it returns to the address it last had in this browser: the
tab, the filters, the sort, the picked creator and the playing video. Then, if
no video is playing, the first one in the list opens, so the right panel is
never empty. A shared link keeps its own view.

### The left panel

Flat sections, one per group, split by a line that runs to the panel's edges:
no box and no grey behind them. Tyler drew it on 20 Oct 2026, and Viral is
trying it; every other dashboard keeps the shell's grey cards. Each section's
heading has a muted count where it has one ("Keywords · 3"), and its own
buttons and fold arrow show only while it is pointed at. Each remembers
whether it is open (`src/components/video-viral/flat-section.tsx`).

- **About:** the description.
- **Keywords:** one plain row per keyword with how its last search went:
  "Waiting to search", "Searching", "12 found · Oct 17", or "Failed" with the
  reason. The picked keyword's row is grey. A
  keyword that found new videos shows "3 new". Clicking a keyword narrows the
  middle panel to the videos it found. The arrow searches that keyword again
  on its own. The cross removes it, after a window saying how many videos go
  with it. Below the rows, side by side, **Add keywords** and **Search every
  keyword** (Tyler, 20 Oct 2026). A panel too narrow for both, which is the
  left panel at its usual width, puts Search on its own row under Add keywords
  rather than cutting its words. Add keywords shows a box for a keyword above
  them, ready to type in; Enter or + adds it and searches it, and the box
  stays for the next one. Escape, or leaving the box empty, hides it again. +
  with nothing typed says to type a keyword first. The line with what a full
  search costs and the units left today is gone (Tyler, 20 Oct 2026); the +
  still says what one keyword costs on hover. Search still refuses a run that
  does not fit today's allowance, and one with no YouTube key saved ("Searching
  needs the YouTube key. Paste one in Settings → YouTube first.").
- **Creators:** every channel behind the project's results, plus everyone
  followed in it, each with their subscribers, hits and typical score, with
  how many there are ("Creators · 40", or "12 of 40"
  while narrowed). Tyler moved it here from a middle tab on 20 Oct 2026,
  together with Add creator. Under the list, **Filter** shows a search box and
  the subscriber range, and **Add creator** opens a small dropdown to add a
  creator by profile link. "Creators" below has the rest.
- **Filters:** what the project asks YouTube for and which videos show, with a
  button to change them.
- **At a glance:** a row each for how many videos and creators, the best
  score, the typical views (the middle number of all of them), the YouTube
  units used and the AI spend.
- **Made from this:** every editor project Make this a template made from this project,
  each one a link into the editor.

### The middle panel

Four tabs in the header: **Videos**, **Downloaded**, **Broken down** and
**Hooks**, each with its count. They are drawn as pills or underlined, as Settings → Styling →
Dashboard tabs says for every dashboard on the site. A row too long for the
header slides sideways.

Right of the tabs, in this order: the **N selected** button while videos are
ticked, the search (a magnifying glass that opens into a box), **Filter**,
**Views**, the list and grid switch, and last **Add a link** ("Pasting a link
in" below). Add a link is the screen's one filled black button, its word beside
a link icon, as the last button (Tyler, 20 Oct 2026). It keeps its word at
every width, unlike Filter and Views, so in a narrow header the tabs slide
sideways sooner. The list and grid switch raises the one showing on a white
chip, the same as the tabs (Tyler, 20 Oct 2026: "if its selected then it
should change color"). The Hooks tab has
no list and grid switch, because it is one list of words either way.

The Videos tab has a list of rows or a grid of covers. A browser that never
chose opens on the list (Tyler, 20 Oct 2026). The choice is remembered in this
browser, and so is the grid's card size (small, medium or large), which is the
last row of the Filter dropdown.

- **Each row of the list** has a small cover, the title with a **New** badge,
  the channel under it (with Downloaded, Broken down or how far saving has
  got), then the score as a short bar and a bold number, how well it fits the
  topic, the views, views a day, the day it was posted ("Oct 15") and its
  length. The video takes the spare width, so the figures sit together at the
  right. Pointing at the score shows how sure it is and each part's points.

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
- **Search** narrows the videos by words in the title or channel name, on what
  is already loaded. Escape empties and closes it.
- **Filter** opens a dropdown with a row each for:
  - **Sort by**: score (the default), views, views per day, newest, or how
    well it fits the topic. In the list, the column headings sort too.
  - **Order**: highest or lowest first.
  - **From**: the keyword searches, the followed creators' own uploads, the
    pasted links, or anywhere. "Anywhere" is still `both` in the address and
    in saved views, the name it had when there were two.
  - **Fits the topic**: hides videos the AI judged off-topic (below 40 or
    below 70). A video the AI has not judged yet is kept, so the filter never
    seems to remove something it never looked at.
  - **Keyword**: the videos one keyword found. Clicking a keyword in the left
    panel sets the same row.
  - **Card size**, on the grid only.

  The button counts the filters set (From, Fits and Keyword). **Clear** empties
  those and leaves the sort and the card size alone. **Save as view** keeps the
  search, filters and sort under a name.
- **Views** lists your saved views on this project. Opening one sets its
  search, filters and sort, as picking them by hand would. A view whose keyword
  has since been removed says so and opens without it. Each row's cog renames
  it or changes what it shows, and "Delete views…" removes them. Views are
  yours alone and live in the shell's saved views, under
  `viral-project:<project id>` (`src/lib/video/viral-saved-views.ts`,
  `src/server/video/viral/saved-views.ts`).
- **Mass select:** the tick boxes stay hidden until **Mass select** is
  pressed. It shows while the grid, or the list's first heading, is pointed
  at; on a phone it always shows. Ticked videos gather in the **N selected**
  button, whose menu has **Break it down**, **Download**, **Star…**, **Hide their
  channels**, and **Delete** on the saved tabs, then **Clear selection**. Each
  is one request. **Hide select** hides the boxes again and clears the ticks.
  A sample project's menu has Hide their channels only, because its videos
  are made up and cannot be saved or starred.

The **Downloaded** tab is the same list kept to the videos saved with
Download whose AI has not run, with the same search, sort, source and fit,
and its own count. Each card has its own **Break it down** button, which moves
it to Broken down without downloading it again. Ticking videos there offers
Break it down and **Delete**. Tyler asked for this tab on 18 Oct 2026. The
address keeps it (`?view=downloaded`).

The **Broken down** tab is the same list kept to the videos whose breakdown
has finished, with the same search, sort, source and fit, and its own count.
A video still being broken down is not in it yet; it is the amber card on the
Videos tab. Ticking videos there offers **Delete**, and no Download or Break
it down, since both are done. Tyler asked for this tab on 17 Oct 2026. The
address keeps it (`?view=broken`).

The **Hooks** tab is the opening words of every broken-down video in the
list, "Hooks" below.

**A picked creator** replaces the tabs with their name, their subscribers and
a back arrow ("Back to every video"), and the middle shows their newest
uploads.

Delete opens a window that lists the editor projects made from those videos
with Make this a template, and says what happens to the downloaded files
(`creator-research.md`, "Deleting a saved video").

None of the sorting, searching or filtering asks the server or YouTube.

### The right panel

Picking a video plays it here. Tyler drew this panel on 20 Oct 2026, and the
Favourites screen shows the same one.

- **The header** has the title, with the platform and channel under it
  ("YouTube · Desk Fit Daily"), then the video's actions as icons, each with
  its name on hover: **Star**, **Copy link**, **Delete** (a saved video only),
  **Hide** the channel, and **Open on YouTube**. A sample has only Hide,
  because its videos are made up.
- **Playing costs nothing.** A YouTube video plays in YouTube's own embed,
  through the no-cookie address so looking at research is not tracked. An
  Instagram video plays in Instagram's own player, the page its Embed button
  gives out (`instagram.com/p/<id>/embed/`), with the account, Like and
  "View more on Instagram" around it (Tyler, 20 Oct 2026: "Make video play
  from IG"). Instagram has no no-cookie address, so Instagram can see who
  watches. TikTok shows its cover and a button out to its own site. A video
  that was downloaded plays from the app's own copy instead. A sample shows a
  dark box with a play mark, "A sample has nothing to play." and its length.
- **Under the player,** one strip: Views, Likes, Comments and Fits.
- **The score** is written large, "62 / 100 score", with how sure it is on a
  button beside it ("Sure: medium"). The button opens and shuts the rest,
  which starts shut, and the browser remembers it left open (Tyler, 20 Oct
  2026: "make this a toggle and hide the graph bar. Move the posted date in
  there too"). Opened, it shows each of the five parts with its points out of
  what it is worth, such as "25.6 of 30", and a bar filled to match, with the
  date the video was posted under How recent, which is worked out from it. A
  line under them says what was missing, such as "Breakdown is missing, so it
  scores 0 of 10. Break this video down to fill it in." The score itself is in
  `viral-score.md`.
- **Details,** a headed section like the breakdown's: its length, views a
  day, and the keywords that found it.
- **A finished breakdown** follows the details (`creator-research.md`).
- **The buttons are pinned to the panel's foot,** on a light grey, under
  everything that scrolls (Tyler, 20 Oct 2026). **Make this a template** (it
  was "Copy this") always has a whole row of its own at the bottom, because its
  words do not fit beside another button in this narrow panel. Above it, a
  video nobody has saved has **Download** and **Break it down** side by side.
  While one is being saved the foot says how far it has got. A downloaded one
  has Break it down, a broken-down one only Make this a template, and a failed
  one says why with **Try again**. On a sample, Download and
  Break it down say the video is made up instead of running. Hovering
  Download says it spends storage only; hovering Break it down says it spends
  from the monthly AI allowance (`creator-research.md` for what each
  downloads and spends). Pressed here, they remember this project: Make this a
  template saves the project's id on the editor project it makes, and the breakdown's
  AI cost counts against this project's spend limit. Download spends no AI, so
  a spend limit never refuses it.

### The address

Everything you would want back after a reload is in the address: the tab, the
playing video (`?open=youtube:<id>`, the dashboard's open record), where it
starts when it was opened from Hooks (`?at=<milliseconds>`), the picked
creator, the sort, the search words, the source, the keyword and the fit. A
reload or a shared link opens the same thing. An address naming a video that
is no longer in the results drops it quietly instead of showing an error.

### On a phone

Below 1280 pixels wide, one panel shows at a time, under a row of three
pills: Videos, Project and Video (or Creator). Picking a video switches to
Video, and picking a creator in the Project panel switches to their videos.
All three stay loaded, so going back keeps the grid exactly where it was.

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

## Pasting a link in

**Add a link**, the black button at the end of the middle panel's header, opens a small window with one
field, for a YouTube, TikTok or Instagram video found anywhere else: a friend
sends a TikTok, you paste it, and it gets the same breakdown as a search
result. Viral task 08, built 20 Oct 2026.

- **Which links work:** one video. `youtube.com/shorts/…`, `youtube.com/watch?v=…`
  and `youtu.be/…`; `tiktok.com/@name/video/…` and the short `vm.tiktok.com/…`
  and `vt.tiktok.com/…`; `instagram.com/reel/…`, `/p/…` and `/tv/…`, with or
  without the creator's name in front. A link copied without `https://` is
  read with it, and an old `http://` one as `https://`.
- **Everything else is refused** in the window, nothing saved, with "That is
  not a link to one video. Paste a YouTube, TikTok or Instagram video, such as
  … Profiles, playlists and other sites can't be added." A profile, a
  playlist, a TikTok page such as `/explore`, and any other site all get it.
  The empty field gets "Paste a link … first". The check is the same one that
  keeps yt-dlp from fetching anything but the three platforms
  (`parseVideoLink` in `src/server/video/viral/download.ts`).
- **Pressing Add and break down** saves the video for Break it down and
  returns at once. The window then shows Downloading, Breaking down and Ready,
  the step running spinning and the ones done ticked, asking every 3 seconds.
  A failure shows yt-dlp's or Gemini's reason with Try again.
- **Closing the window stops nothing.** The background worker does the work,
  as for any saved video (`creator-research.md`), and the video's row in the
  list stays amber with "Downloading…" or "Watching it…" until it is done.
- **Open the video** (Open the breakdown once it is ready) closes the window
  and plays it on the right, its breakdown under it.
- **A video already saved** is that saved copy, never a second one. The window
  says "You saved this video before, so this is that copy." A broken-down one
  is Ready at once and spends nothing. One saved with Download alone has its
  breakdown turned on, from the file already stored. One that failed shows
  its reason and Try again. Pasting the same link twice is one row.
- **Where it shows:** in the project it was pasted into, among its videos,
  with a **Pasted** chip, and Filter → From → Pasted links keeps only those.
  The Downloaded, Broken down and Hooks tabs pick it up as for any other video.
  Until the download lands, its title is the link and its figures are blank.
  If a keyword or a followed creator also found it, it is that card, once.
- **The numbers** are yt-dlp's own answer from the download, the fields the
  old app read: views, likes, comments and posted date, plus the channel and
  its follower count where the platform says. The score works from them like
  any other video's. TikTok and Instagram hide follower counts, so a video
  from either says "Missing follower count" in its score, the way a sample's
  does.
- **Spending:** the AI spend is the breakdown's, counted against this project's
  spend limit. The limit is checked only when the AI would actually run, so a
  video already broken down opens even in a project that has spent its limit.
- **A sample project refuses it**, saying its videos are made up.
- **Which projects a video was pasted into** is `video_viral_project_links`
  (`drizzle/0136`), because a saved video is its owner's and not a project's.
  Deleting the project takes the link and keeps the saved video and its
  breakdown. Deleting the saved video takes it out of the project. Duplicate
  copies no pasted links, the same as it copies no results. Hiding a pasted
  video's channel hides it, like any other video.
- The code is `src/server/video/viral/pasted-links.ts` and
  `src/components/video-viral/paste-link-dialog.tsx`.

Following the creator who posted it is a separate task (viral 30).

## Hooks

The **Hooks** tab lists the opening words of every broken-down video on the
screen, one row each: you are about to film, you open the project's hooks and
read twenty openings that worked. Viral task 16, built 20 Oct 2026. A
Favourites collection has the same tab beside its Videos (`?view=hooks`).

- **Each row** has the cover, the words in quotes, the channel, the views and
  when the hook runs ("0:00 to 0:03"), then the score and a copy button. Copy
  puts the words on the clipboard, without the quotes, and says "Hook copied."
- **The words** are every line of the breakdown's transcript said or shown
  while its hook part runs, joined by spaces, including a line that starts
  just before the hook or runs on after it. The transcript holds speech and
  on-screen text alike, so a video with no speech gives its captions.
  `hookLine` in `src/lib/video/viral-breakdown.ts` works it out, on the
  server, as the screen is read, so opening the tab asks nothing. The pace and
  "what the winners share" tasks (viral 17 and 18) are to use the same
  function.
- **Left out:** a video with no hook part, and one with nothing said or shown
  during its hook. A line under the list counts them: "1 broken-down video is
  left out, because nothing is said or shown during its hook."
- **The order** is the screen's sort, which is the score, highest first, unless
  Filter says otherwise. The search, From, Fits and Keyword filters apply as on
  every tab, so Keyword gives the board for one keyword. A collection's search
  and sort apply the same way.
- **Clicking a row** plays the video on the right from the hook's first
  moment. The address keeps it (`?at=` in milliseconds), so a reload starts
  there too. A hook starting at 0:00 leaves `at` out. Picking a video from any
  other tab starts it from the beginning.
- **Empty:** "No hooks yet. Break videos down and the words of each one's
  opening show here." With broken-down videos but none with words, it says how
  many there are and that none says or shows anything during its hook.

Rewriting a hook for your own topic is a separate task (viral 25).

## Filters and settings

The cog in the left panel's header opens **Project settings**. Each card folds
from its header and this browser remembers which were left shut; a shut card
opens by itself while a field in it is refused (Tyler, 20 Oct 2026; how it
works is in `project-first.md`, "Project settings"). The cards:

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

The Creators card in the left panel lists every channel behind the project's
results, plus every creator followed in the project, most hits first.

- Each row has the picture, the name, a Following or Paused badge, and one
  muted line: the subscribers and the **hits** (how many of the project's
  videos are theirs). **Typical** (the middle score of their videos) sits at
  the row's right for a creator the search found. A followed creator's line
  adds their typical score and when they were last checked ("0 hits · 49
  typical · 3h ago"), and the row's right holds their **Check for new posts**
  switch (Tyler, 20 Oct 2026).
- **Filter**, under the list, shows a search box and **Subscribers from** and
  **Subscribers up to**, for example creators with 10,000 to 500,000 subscribers. A creator
  whose count is hidden only shows with no range set. The search and range
  stay while you move around the screen and start empty on a reload.
- **Picking a creator** fills the middle panel with their newest uploads and
  shows their card on the right: picture, subscribers, hits, how often they
  post, Follow or Unfollow, their profile and Hide. Picking one of their videos
  plays it, and the arrow in the player's header goes back to their card.
- **A followed creator's uploads** come from what the app already saved and
  cost nothing. **Anyone else's** are asked of YouTube for 2 units, and only
  YouTube channels can be looked at without following them.
- **How often they post** is videos a week over the last 4 weeks. With fewer
  than 3 posts known it says "Not enough posts yet".
- **Check for new posts** is the switch at the right of each followed
  creator's row, and hovering it says what it does. Switching it off pauses the watch
  timer for that creator in every project they are in, because a creator is
  stored once (`creator-research.md`, "Pausing one creator"). Creators found
  only through the search have neither, because the timer never checks them.
- **Follow** adds them to this project. A YouTube creator's 10 newest uploads
  are read at once, so the grid has them before the watch timer's next turn.
- **Add creator**, under the list, opens a small dropdown with a **Profile
  link** box: a YouTube channel, a TikTok profile or an Instagram profile, for
  somebody the search did not find. Enter adds them. TikTok creators' videos
  arrive when the watch timer next checks. Instagram creators can be added but
  never get videos, because Instagram refuses the app's requests
  (`creator-research.md`). A sample project follows nobody, so its + is off
  and says why.

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

## Make this a template and the editor

Make this a template from a Viral project makes an editor project that remembers both
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

- Migration 0136 must run on the live database before Add a link works: it
  adds `video_viral_project_links` and the saved video's `channel_id` and
  `subscribers`, which the worker now writes on every download.
- Migrations 0114, 0115, 0116 and 0121 must run on the live database. 0114
  moves the old searches and folders as above, 0115 adds the Favourites link,
  0116 adds the saved covers, and 0121 adds the Downloaded status and the title
  a deleted video leaves on projects copied from it (`creator-research.md`).
- The background search worker runs wherever the app's worker loop runs. It
  only ever searches keywords somebody queued after the allowance check.
- The YouTube key is the one in Settings → YouTube (`viral-search.md`).
