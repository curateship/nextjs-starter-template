# Waveforms on sound and video clips

Sound clips and video clips on the timeline draw the real shape of their sound,
so you can see where a sentence starts, where the pauses are and where a beat
lands, and cut there without playing the clip again and again.

## What you see

- **Before the shape is ready:** the clip shows the same made-up green pattern
  it always did. A file uploaded seconds ago shows that pattern for a few
  seconds.
- **When the shape arrives:** the pattern is swapped for the real shape in one
  paint. The colour, height and position of the drawing stay the same, so the
  clip does not jump or flash.
- **Quiet stretches:** silence draws as a thin line along the middle, not as a
  gap, so a pause reads as a pause.
- **A file with no sound at all:** the clip shows its plain green fill and no
  drawing, because there is nothing to draw.
- **How tall it goes:** the loudest moment in the file reaches the full height
  of the drawing, and everything else is scaled to that. A quiet voice-over is
  as readable as a loud song. The drawing shows where the sound is, not how loud
  the file is, and the clip's volume slider does not change it.

## On a video clip

A video clip keeps its picture frames and draws the shape in a thin strip along
its bottom third, over the frames. Tyler chose that on 18 Oct 2026, so the
frames still say which shot it is and the strip says where the talking is.

- **The strip:** a dark band a third of the clip's height, with the shape in a
  lighter green on it, so it reads over a bright or a dark picture.
- **Sound switched off:** a clip whose sound is muted, whose volume is at 0, or
  whose lane is muted draws the strip faded, at 40 out of 100 strength. The
  shape stays visible, because a muted clip is often one where you still want
  to cut on the words.
- **Before the shape is ready:** a video clip draws no strip at all, rather
  than the made-up pattern sound clips show. A made-up pattern over real
  frames would look like real sound.
- **A video with no sound:** no strip.

## Trimming and speed

The whole file's shape is drawn at its full length, then slid left by the part
that was trimmed off. Trimming the left edge by one second slides the shape one
second's worth to the left, so each word stays under the same spot on screen.
The shape is never squashed to fit the clip.

A clip playing at 2x packs its shape into half the width, the same way the clip
itself gets half as long. `waveformPlacement` in `src/lib/video/waveforms.ts`
holds the sum. Video clips use the same sum, so splitting, trimming and
changing speed keep a video's strip lined up with its sound the same way.

## How the shape is made

The media worker builds it in the background, the same way it builds playback
copies and frame strips for videos. The code is `buildWaveform` in
`src/server/video/media-workers.ts`.

- **Which files get one:** every video and every sound file in the library.
  Within one 15-second tick of an upload, the file gets a `queued` row in
  `video_media_waveforms`.
- **Taking turns:** the worker works through three queues in turn: playback
  copies, frame strips, then waveforms. When one queue is empty the next one in
  line gets the slot, so a long backlog in one never starves the others.
- **What it reads:** for a video it uses the smaller playback copy when that is
  ready, and the original otherwise. A sound file is read as uploaded.
- **What it keeps:** 25 points a second, one byte each, from 0 to 255. Each
  point is the loudest sample in its 40 milliseconds. A file longer than 20
  minutes gets fewer points a second, so no file stores more than 30,000.
- **How long it takes:** 1 to 4 seconds for the files in the local library,
  which run between 3 and 14 seconds long.
- **When it fails:** the worker tries 3 times, then marks the row `error`. The
  clip then keeps the made-up pattern.

## Why the points live in the database row

The frame strips are image files in storage. The waveform points are small
enough to sit in the database row as text instead: 30,000 points is about 40KB.

- **One less stored file:** there is no storage key to write, serve or clean
  up.
- **Nothing left behind:** deleting a file from the library deletes its row,
  and the points go with it.
- **One query to serve it:** the same query that checks whether the shape is
  ready also returns it.

## How the timeline fetches it

`GET /api/v1/video/media/{mediaId}/waveform` answers only for the signed-in
owner of the file.

- **Still being built:** it answers 202 with `Retry-After: 2`, and the timeline
  asks again every 2 seconds for up to 2 minutes. A file uploaded so recently
  that the worker has not seen it yet gets the same answer.
- **Ready:** it answers with the points as base64, how many there are, and how
  long they span.
- **Failed:** it answers 404, and the clip keeps the made-up pattern.

The browser turns the points into one SVG outline per file and keeps the last
50 in memory. Every clip cut from the same file shares that outline, whether it
is a sound clip or a video clip.

## Limits worth knowing

- **Very long files:** the worker decodes the sound to a temporary file of
  about 1MB a minute before counting the points. A two-hour video is about
  115MB of temporary file, deleted when the job ends.
