# Sound effects

The **Sounds** panel, under Music on the editor's rail, holds short sound
effects to drop on cuts: whooshes, pops, dings and the like.

## Using it

- **Hearing one:** the play button on each row. Only one plays at a time.
- **Laying one:** drag the row onto the timeline where it should play. Dragging
  is the only way a sound lands, as in the Media panel, so pressing play never
  adds one by accident. It lands as a sound clip at its own length.
- **Lengths:** each row says how long the sound is, in tenths of a second.

## The starter pack

Thirty sounds ship with Video, in five groups: Moves, Pops and clicks, Bells
and alerts, Hits, and Funny (`src/lib/video/stock-sounds.ts`).

- **Where they came from:** they were made for this app by
  `scripts/make-starter-sounds.mjs`, which draws each one with ffmpeg from
  sums (tones, noise, sweeps and decays) rather than recording anything. They
  are this app's own work, so there is no licence to follow and no credit to
  show. Running the script again remakes the same thirty.
- **Where they are kept:** twice, because two programs read them. The browser
  plays `public/sounds/<id>.mp3`. The export reads
  `src/server/assets/sounds/<id>.mp3`, which the worker build copies beside its
  bundle the way it copies the fonts. 348KB each time.
- **Nobody's library fills up:** a starter sound on the timeline is a sound
  clip with `stockSound` set and no file of anybody's. Nothing is added to the
  media library.
- **Replacing it:** Replace media on a starter sound clip swaps in a file from
  the library, and the clip is that file from then on.

## Your own sounds

Above the starter pack, **Your sounds** lists sound files you have uploaded
with the panel's plus button. They follow you into every project, the same as
the music shelf.

- **The cross on a row** takes it off your sounds. The file stays in the media
  library.
- **Stored:** a mark on the file in `video_sound_effects` (migration 0144).
  Deleting the file removes the mark.
- **Guests:** a guest sent from Project does not see the Sounds panel, because
  your sounds are your own.

## Uploading sound used to be refused

Until 30 Oct 2026 the shell's upload check recognised pictures and video but
no sound format, so every MP3 or WAV was refused with "File content does not
match the selected media type." That was fixed in the shell and copied into
Video, so the Music panel's uploads work too. The repo's
`docs/shell/security.md`, under Media, has the shell's side.

## Checked

- **A real export:** a starter beep laid at one second was silent before it
  and loud from 1.05 seconds (`src/server/video/render-editor-features.test.ts`).
- **The browser:** the panel listed all thirty, Pop played, a Whoosh dragged
  onto a lane became a clip, and an uploaded MP3 was accepted and listed under
  Your sounds at 1.6 seconds.
