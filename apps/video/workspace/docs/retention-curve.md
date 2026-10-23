# Retention curve

After a video goes up on YouTube by hand, its link is pasted on the export it
came from. Video reads the retention curve YouTube already measured for it and
draws it over that export's scenes, so a drop lines up with the scene people
left during. The figures are kept with the export, and opening it again shows
them without asking YouTube anything.

A worked example: a 30-second Short holds 90 out of 100 viewers through the
hook and drops to 40 by the twelve-second mark. Over the scene columns, twelve
seconds is the start of scene 3, the picture that sat still for six seconds.
The next video gets a cut there.

## Signing in to the channel, once

- **Where:** Settings, App settings, YouTube, in the YouTube channel card under
  the API key.
- **The Google client:** an OAuth client of the "Web application" type that
  Tyler makes in Google Cloud. Its client ID and client secret are pasted into
  the card and save themselves. The secret is scrambled before it is stored
  and shows as dots afterwards. It is its own client, not the one members use
  for "Continue with Google", so the YouTube permissions never touch the
  members' sign-in page. Tyler chose this on 22 Oct 2026.
- **The return address:** the card shows it with a Copy button. It goes into
  the client's "Authorised redirect URIs" in Google Cloud. Each place the app
  runs has its own (the live site and local development), and each one used
  must be listed there.
- **Connect YouTube** sends the browser to Google. Google asks which account,
  then shows the two permissions. Back on the card, it says "Connected to
  <channel> since <date>".
- **Disconnect** deletes the app's sign-in to the channel and asks Google to
  cancel it too. If Google cannot be reached, the sign-in is still deleted
  here, and the card says the app may still be listed under the Google
  account's connected apps.
- **Pasting a different client ID** disconnects the channel the same way
  Disconnect does, because a sign-in made through one client cannot be used by
  another. A new secret for the same client keeps it. The ID and the secret
  each save on their own, so pasting both quickly never loses either one.
- **Only admins** see the card in Settings and the YouTube card on an export.
  The channel is the site's, so its figures are not every member's to read.

## Setting up the Google client

Tyler does this in the Google Cloud console. The app cannot.

1. In one Google Cloud project, switch on the "YouTube Analytics API" and the
   "YouTube Data API v3".
2. On the OAuth consent screen, add the two permissions below.
3. Make an OAuth client of the "Web application" type. Add the return address
   from the card under "Authorised redirect URIs".
4. Paste the client ID and secret into the card, then press Connect YouTube.

Google shows an "unverified app" warning on its screen until the app is
verified. For one channel signing in that is fine; verification is only worth
doing if other people's channels will sign in. While the consent screen is
left in "Testing", Google ends the sign-in after seven days and Refresh asks
for Connect again, so set it to "In production".

## The two permissions, both read-only

- **`yt-analytics.readonly`:** reads the channel's figures, the curve
  included.
- **`youtube.readonly`:** reads the channel's name and its videos. It is how
  the card shows which channel is connected, and how a pasted video is checked
  to be the channel's own.

Nothing the app does can post, edit or delete anything on the channel. If
either box is unticked on Google's screen, the connect is refused and the card
says both are needed.

## Pasting the link

- **Where:** the export's window (an export's name on Exports, or a project's
  Exports panel), in the "Posted on YouTube" card under "Made by AI". Only a
  finished video export has it.
- **What it takes:** a youtube.com watch, Shorts, live or embed address, a
  youtu.be link, or the 11-letter id alone. Anything else is refused in words
  before YouTube is asked.
- **The check:** the video must be on the connected channel. A video from
  another channel is refused, naming the connected channel.
- **Reading straight away:** a link that passes is kept, and the figures are
  read at once. If they cannot be read yet, the link stays and Refresh tries
  again.
- **Remove link** forgets the link and its figures. Nothing on YouTube changes.

## What is kept

All of it is in the database, never in the browser:

- `video_settings.youtube_oauth_client`: the client ID and the scrambled
  secret.
- `video_settings.youtube_oauth`: the scrambled refresh token (the lasting
  sign-in Google hands back), the channel's id and name, and when it was
  connected.
- `video_export_youtube`, one row per posted export: the video's id, the
  channel it was checked against, its title, when it went up, its length on
  YouTube, the curve's points, the views, how long a view lasts on average,
  and when they were read. Deleting the export deletes the row.
- `video_render_jobs.scenes`: the export's scenes, saved by the render (below).

Disconnecting keeps every curve already read; only Refresh needs the channel.
The browser only ever learns the channel's name and the secret's last four
characters.

## The two figures, in plain words

YouTube answers the curve at up to 100 points through the video.

- **Still watching, out of 100** is the line. At twelve seconds, 40 means 40
  out of every 100 people who started the video were still watching there.
  People who skip back and watch a part twice can lift it past 100, and the
  chart grows to fit. It is YouTube's `audienceWatchRatio`.
- **Better than this many videos this long, out of 100** is the shaded band.
  It compares this video with every YouTube video of about the same length at
  the same moment. 50 is typical, and the chart marks 50 with a dashed
  "typical" line. 70 means it holds people better than 70 out of 100 videos
  that long. It is YouTube's `relativeRetentionPerformance`.
- **Above the chart:** the views and how long a view lasts on average, as of
  the time the figures were read.
- **Hovering** says, for example, "Scene 3: Kitchen", then "12 s, scene 3, 40
  out of 100 still watching" and "Better than 62 out of 100 videos this long".

**For a Short,** YouTube Studio judges it mostly on "stayed to watch" against
"swiped away" in the feed. That number is not one of the two figures here.
The figures here are the curve, counted over the people who watched it.

## Scene columns

The chart is drawn over the export's scenes, every other one shaded and each
numbered when there are 20 or fewer.

- **A scene** is a stretch where the same picture is on screen. One starts
  wherever a video or picture clip starts or ends, and is named after the
  clip on the top lane then. Text, sound and empty stretches start none. Two
  changes closer than a quarter of a second count as one cut, so a blend
  between two clips is not a scene of its own.
- **Saved with the export.** The render works the scenes out from the
  timeline it draws and keeps them, so editing the project later never moves
  them. Tyler chose this on 22 Oct 2026.
- **Exports made before this** kept no scenes. Their columns are the project's
  scenes as it is now, and the card says so.
- **Different lengths.** When the video on YouTube and the export differ by
  more than a second, the card says so, because the columns may sit a little
  off.

## YouTube's day or two of lag

YouTube's figures arrive a day or two after the views do. For a video that
went up less than 48 hours ago, the card says the curve may be missing or
still filling in. YouTube also gives no curve at all until enough people have
watched, and the card says that when the answer comes back empty.

## What it costs, and when YouTube is asked

- **Pasting a link** makes four calls: one to Google for a fresh access token,
  one Data API read to check the video, and two Analytics reads. The curve and
  the totals come from two different YouTube reports, so they cannot be one
  call.
- **Refresh** makes three: the token and the two Analytics reads.
- **Opening the export again** makes none.
- These calls spend the Google client's own quota, not the API key's 10,000
  units a day that Viral search uses.

## When something goes wrong

Every refusal is a sentence on screen:

- No client pasted, or a secret that can no longer be read: paste it in
  Settings, YouTube.
- Google refusing the client ID or secret: check both, then connect again.
- No channel connected: connect it in Settings, YouTube.
- Google refusing the lasting sign-in (the owner cancelled it, or it lapsed):
  connect again.
- The channel connected now is not the one the video is on: connect that
  channel, or remove the link and paste another.
- YouTube unreachable: try again in a moment.

## The code

- `src/server/video/youtube-oauth.ts`: the client, the trip to Google and
  back, the token refresh, Disconnect.
- `src/routes/api/v1/video/youtube/connect.ts` and `callback.ts`: the two
  addresses of the trip.
- `src/server/video/youtube-retention.ts`: pasting, reading, Refresh, Remove.
- `src/lib/video/retention.ts`: the link reader, the stored shapes and every
  sentence.
- `src/lib/video/export-scenes.ts`: the scenes, worked out by the render in
  `src/server/video/render-queue.ts`.
- `src/components/video-retention/`: the Settings card, the export's card and
  the chart, which is the shared `ChartContainer` and the app's chart colours.
- `drizzle/0142_video_youtube_retention.sql`: the two settings columns, the
  scenes column and the `video_export_youtube` table.
