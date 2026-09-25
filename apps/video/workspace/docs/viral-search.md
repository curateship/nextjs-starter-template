# The Viral page's YouTube search

The Viral page (`/admin/video-viral`) takes one keyword and lists the YouTube
Shorts about it, with each one's views, likes, comments, age and the channel's
subscriber count. Clicking a row opens the video on YouTube in a new tab. The
page is admin-only, because every search spends part of a daily allowance.

## Where the key goes

Searching needs a YouTube Data API key, free from console.cloud.google.com
with the YouTube Data API v3 switched on.

- The key is pasted in **Settings → YouTube** (the app's own tab, under "This
  app"). It is scrambled before it is stored, on the same `video_settings` row
  as the brand kit, with the same encryption the shell uses for AI keys. Only
  its last four characters are ever shown again.
- A deployment can set `VIDEO_YOUTUBE_API_KEY` instead. A key saved in
  Settings always wins over the env var.
- With no key anywhere, the Viral page says so in one sentence and searches
  nothing.
- The key is deliberately not on the shell's Settings → AI list. That list is
  shell-owned code, and YouTube is not an AI provider.

## What one search costs

Google gives every key 10,000 free units a day. One keyword costs exactly 102:

- The search itself is 100 units.
- One batch call fetches the numbers for all the videos at once, 1 unit.
- One batch call fetches all their channels' subscriber counts, 1 unit.

So one key is good for about 98 searches a day. When the day's units run out,
the page says "Today's 100 free YouTube searches are used up. They reset at
midnight Pacific time." Any other YouTube refusal is shown as YouTube's own
sentence, never raw JSON. Because a search costs money's worth of quota,
typing never searches — only pressing Search or Enter does, and sorting the
results is done in the browser on what already came back.

## Why Shorts means 3 minutes or less

YouTube's API can only filter to "short", which means under 4 minutes, so a
3:59 video would slip through. YouTube's real Shorts limit is 3 minutes, so
the server drops anything over 180 seconds after the search
(`src/server/video/viral/youtube.ts`).

## The filters

Posted within the last 7, 30 or 90 days (7 is the default), and a minimum
view count. Keyword, window, minimum and sort all live in the address, so a
reload repeats the same search and the address can be handed to somebody else.
A channel that hides a count shows "—" rather than a zero.

## What is kept

Every search is saved with its results the moment YouTube answers
(`video_viral_searches` and `video_viral_results`, migration 0092), so
looking at a past keyword costs nothing.

- The past-keywords panel on the left lists every saved search, the one that
  ran last first, with how many Shorts it found and when it ran. Clicking one
  shows its saved results without asking YouTube.
- After a fresh search, the address swaps the keyword for the saved search's
  id, so a reload or a shared address opens the saved copy free.
- The same keyword searched again updates its old row and replaces its
  results — matched ignoring case, the way YouTube matches — so the list
  never piles up copies. That was the task's open question, answered the way
  the task assumed.
- A failed YouTube call saves nothing: the search runs first, and the row and
  its results land in one database transaction.
- Saved results go stale the moment they are saved: the numbers are a
  snapshot of the moment the search ran, and the "ran ..." line on the open
  search says how old they are. Run again fetches fresh numbers for the same
  keyword and filters, replaces the results, and moves the date.
- Deleting saved searches (tick them in the panel) removes only the keyword
  rows and their result rows, in one request.

## What is not here yet

Saving searches is task 02, the score is task 03, and TikTok and Instagram
are task 09, all in `workspace/tasks/viral/`.
