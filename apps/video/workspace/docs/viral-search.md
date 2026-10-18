# The YouTube key behind Viral

Viral searches YouTube with one YouTube Data API key for the whole app. What a
search costs, how it runs and what it finds are in `viral-projects.md`; this
file is the key itself and the call it makes.

## Where the key goes

The key is free from console.cloud.google.com with the YouTube Data API v3
switched on.

- **Settings → YouTube** (the app's own tab, under "This app") holds it. It is
  scrambled before it is stored, on the app's `video_settings` row, with the
  same encryption the shell uses for AI keys. Only its last four characters
  are ever shown again.
- **A deployment can set `VIDEO_YOUTUBE_API_KEY` instead.** A key saved in
  Settings always wins over the env var.
- **With no key anywhere**, a project's left panel says so under the Search
  button, and pressing Search says where to paste one. Nothing is spent.
- The key is deliberately not on the shell's Settings → AI list. That list is
  shell-owned code, and YouTube is not an AI provider.

## The call

`searchYoutubeVideos` in `src/server/video/viral/youtube.ts` makes three
calls for one keyword, and never more:

1. The search, ordered by view count, posted within the project's window, up
   to 50 videos. 100 units.
2. One batch call for all the videos' numbers. 1 unit.
3. One batch call for all their channels' subscriber counts. 1 unit.

The key travels in a header, never in the address, because an address ends
up in logs.

- **A used-up allowance** comes back as the sentence "Today's free YouTube
  allowance is used up. It resets at midnight Pacific time."
- **Any other refusal** is shown as YouTube's own sentence, such as "YouTube
  said: API key not valid", never raw JSON.
- **A channel that hides a count** shows "—", never a zero.
- **Thumbnail addresses** are kept only when they are plainly https.

## Why Shorts means 3 minutes or less

YouTube's API can only filter to "short", which means under 4 minutes, so a
3:59 video would slip through. YouTube's real Shorts limit is 3 minutes, so
the server drops anything over 180 seconds. A project set to longer videos
asks for any length and drops everything 180 seconds or under instead.
