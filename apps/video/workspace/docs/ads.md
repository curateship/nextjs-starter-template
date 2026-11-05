# Ads

The **Ads** button on the editor's left menu, after Sounds, holds the tools for
putting ads into a video: a shelf of your ads, placing them for you, text ads
over the video, an AI sponsor read, and what the video's ads add up to. Tyler
asked for it on 4 Nov 2026 and picked the features over four rounds; the task
is `workspace/tasks/ads/01-sounds-and-ads.md`, and his answers there are the
rules.

A guest sent from Project does not get the Ads button, the same as Sounds.

## What an ad is on the timeline

- **An ad is a clip with an ad mark** (`ad` on the clip in
  `src/lib/video/timeline-schema.ts`). The mark says which shelf ad it came
  from, whether the video pauses for it, and whether Place ads put it there.
- **Ads live on the Ads lane**, which always stays at the top so ads cover the
  video. Nothing else lands on it: a drop aimed at it goes to another lane, and
  a pasted ad comes in as a plain clip. Two ads at the same moment open a
  second Ads lane. The lane's icon is a megaphone, it has no grip, and its
  clips are coral with "Ad ·" before their name.
- **"Your video pauses" or "Ad plays over it", picked per ad.** Tyler, 4 Nov
  2026: "I pick per ad". Pausing cuts every lane at the ad's start and pushes
  the rest of the video later by the ad's length, so the video gets longer.
  Over leaves the video running underneath. The switch is in the Ad card at
  the top of the right-hand panel. A sponsor clip starts on pausing; a text ad
  always plays over.
- **A pause ad takes its gap with it.** Deleting it closes the gap and puts the
  footage it cut back into one clip. Anything laid across the gap since, such
  as music, loses the stretch inside it, so nothing ends up on top of anything
  else. A pause ad never cuts another ad in two: an ad already across that
  moment stays where it is. Dragging it, trimming it, changing its
  speed or fitting it to a length moves the video after it to match.
- **Dragging a pause ad** to a spot past its end puts it where that moment of
  the video is once its own gap closes: dropped at 8:00, an ad of 30 seconds at
  6:00 lands at 7:30. Dropped inside its own gap, where no video shows, it stays
  at its cut. Trimming its left edge keeps it at its cut and shortens the gap.
- **Every Ads panel action is one undo step.**
- **Locking the Ads lane** (the lock on its head) stops its ads being dragged,
  trimmed or cut, and stops later edits spreading them out again. The ads can
  still be picked, changed from the Ad card and taken off.

Everything about where ads go is plain arithmetic in `src/lib/video/ads.ts`,
shared by the editor, the server and the tests.

## The ads shelf

Each person's own, the same in every project, at most 200 ads
(`video_ads`, `drizzle/0153_video_ads.sql`). Tyler, 4 Nov 2026: "Video clips +
text ads".

The panel itself is only the shelf. Tyler, 4 Nov 2026: "all these should be in
+ dropdown", then "put it in the 3 vertical dot dropdown", "this should be an
option that drops down after clicking the ad" and "Put the add text add to the
+ dropdown". So the controls sit in three places:

- **The + menu** (the shell's folding menu) is for adding. Its Text ad row
  folds open to the words, the look, Add at playhead, Save to shelf and Write
  with AI. Under its line are Upload a sponsor clip (a video or sound file),
  From your media (the media library picker) and AI sponsor read.
- **Pressing an ad on the shelf** drops its placing options down under it:
  Where (Equal parts or Where viewers stay), Place ads, At the start and At the
  end. How many times Place ads puts it in is set once for the video, under ⋮
  in Ads in this video (Tyler, 4 Nov 2026: "shouldn't that be in the 3 dot
  dropdown options?"). Pressing it again folds them away. Where is a picker rather
  than two tabs, because "Where viewers stay" alone is wider than the panel at
  its narrowest.
- **The ⋮ menu** is about this video's ads: Ads in this video folds open to
  how many times Place ads puts an ad in, and its In this video row folds open
  to the totals, the warning, Copy ad break times and Swap, and Take every ad
  off sits under its line in red.
- **Each row** also drags onto the timeline, has a + to lay it at the playhead,
  and a bin to take it off the shelf. Taking it off keeps the file in the
  media library and leaves ads already in videos alone.

## Placing ads

Press a shelf ad, say how many, then **Place ads**.

- **Equal parts.** The video is split into one more part than there are ads,
  and an ad goes between each: 3 ads in a 12 minute video land at 3:00, 6:00
  and 9:00 before the two rules below move them. Tyler's own idea.
- **The first minute and the last 30 seconds stay clear.** Tyler, 4 Nov 2026:
  "First 60s, last 30s". When an equal spot falls outside that, the parts are
  measured inside it instead. A video too short to leave any room says so.
- **Each ad moves to the nearest pause between sentences**, within half a part
  of its spot, read off the captions' word times on the timeline. With no
  pause near, it at least moves to the end of the word it fell in. A video with
  no captions keeps the equal spots.
- **How many** starts on what the length rules give the video (below), and can
  be changed before pressing.
- **Where viewers stay** places the ads where people kept watching longest,
  averaged over the viewer curves of the YouTube videos in this video's
  project (Tyler: "This video's project"), still at pauses and outside the clear
  ends. With fewer than 2 curves it says so and uses equal parts.
- **Pressing it again** takes the ads it placed before off and lays a fresh set.
  Ads you put down by hand stay.
- **At the start and At the end** put the picked ad at 0:00 or after the last
  of the video, on purpose, past the clear ends.

## Ads stay spread after edits

After an edit makes the video longer or shorter, every ad Place ads put down
moves to keep its share of the way through, still at a pause and outside the
clear ends, in the same undo step as the edit. Cutting a minute off a 12 minute
video with ads at 3:00, 6:00 and 9:00 moves them to 2:45, 5:30 and 8:15.

An ad you dragged by hand is no longer Place ads' to move, and a locked Ads
lane is left alone. A slider or typing waits for the edit that ends it.

## Text ads

Words only, along the bottom of the video, for 8 seconds, over the video, with
a short fade at each end. Tyler, 4 Nov 2026: "Words only" and "Bottom, 8
seconds". Type the words in the Text ad section and press Add at playhead.

- **Clear of the platforms' buttons.** On a tall 9:16 video a text ad is kept
  inside the safe box (`safe-box.md`) of the platform the captions are set for,
  or, with none picked, inside the edges every platform covers.
- **Saved looks.** With a text ad picked, the Ad card's Save this look keeps
  its font, size, colours and box under a name (`video_ad_looks`), 50 at most. The Look
  picker in the Text ad section lays new text ads in it.
- **Write with AI.** Type a few words about the product and press Write with
  AI; the AI writes the ad's words, at most 12, keeping names, codes and prices
  as typed. The price shows on the button.

## The AI sponsor read

The + menu's AI sponsor read: say what the sponsor sells, pick 15, 30 or 60
seconds (Tyler: "I pick each time") and one of your own cloned voices. The
server refuses any other voice, because a language copy says the read again
with that voice at ElevenLabs. The AI
writes about 170 words a minute of read, your voice says it, and it lands on
the shelf and at the playhead. The price shows on the button and counts toward
the video's AI spend limit. The shelf keeps the read's script and voice, so a
language copy can say it again.

## Sound and length

- **Fades.** Every ad fades in and out over half a second.
- **Volume matches the voice.** When a sponsor clip is laid, its loudness and
  the voice's are measured with ffmpeg (each file once, kept in
  `video_media_loudness`; a measurement that failed is not kept, so the next
  ad tries again). An ad louder than the voice is turned down by the
  difference: 6 decibels louder plays at half volume. A quieter one plays as
  recorded, because a clip can only be turned down. The voice is the file heard
  longest that is not on a music lane or an ad. A video over 1GB with no smooth
  copy yet is not measured, and its ads play as recorded.
- **Fit to a length.** The Ad card's Fit to a length speeds the ad up, never
  past 1.2 times, then trims the end for whatever is still over. A 33 second ad
  fits 30 seconds by speed alone. A text ad just runs that long.
- **Music under an ad** already drops by itself, because ducking lowers a music
  lane under anything else making sound.

## What the ⋮ menu reports

- **In this video:** "3 ads, 1 min 30 of a 12 min video". Past the limit set in
  Settings it warns in red.
- **Copy ad break times** copies where each ad that is not text starts, such as
  "3:02, 6:10, 9:05", for YouTube Studio's ad breaks. Under 8 minutes it adds
  that YouTube only allows ad breaks from 8 minutes.
- **Swap** turns every ad from one shelf ad into the one pressed on the shelf,
  in its place and mode. A different length moves the video after a pause ad.
- **Take every ad off** removes them all, closing every gap.

## Settings → App settings → Ads

One set of rules for the install, saved as you type (`ad-settings.tsx`,
`video_settings.ad_rules`). Tyler: "I set them in settings".

- **No ads under** 1 minute, **one ad up to** 8 minutes, **then one every** 4
  minutes. 12 minutes is 3 ads; 9 minutes is 2.
- **Warn past** 15 out of every 100 seconds. 2 minutes of ads in a 12 minute
  video warns; 1 min 30 does not.

## Outside the editor

- **Progress bar marks.** A video with a progress bar
  ([progress-bar.md](progress-bar.md)) shows a small mark where each ad break
  starts, in the preview and the export.
- **The viewer curve.** Each export keeps where its ads were
  (`video_render_jobs.ads`), and its YouTube viewer curve
  ([retention-curve.md](retention-curve.md)) draws a dashed line at each, with
  how many out of 100 were watching just before and just after it.
- **Language copies.** Tyler: "Translate everything". A copy in another
  language translates every text ad and says each AI sponsor read again in that
  language with the same voice, fitted to the read's spot. The copy's new
  voice and its captions pause at every pause ad the way the video does
  ([another-language.md](another-language.md)).
- **Carousels.** Under Add slide, **Add an ad slide** puts a shelf ad in as the
  last slide (Tyler: "Last"): a sponsor clip as a full video slide, a text ad
  as words across the middle in its look. A sound with no picture is not
  offered.
