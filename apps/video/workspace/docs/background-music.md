# Background music

The Music panel in the studio rail lists the sound files marked as music. One
press on a track lays it under the whole video on its own lane, with "Duck
under voice" already on, so the music drops by itself wherever somebody talks.

## Where the music comes from

Music is sound files you upload yourself and mark as music. There is no
outside music service.

- **Why uploads:** it is the smaller build and there is no licence question.
  Whoever uploads a track is the one who knows whether they may use it.
- **What a mark is:** a row in `video_music_tracks` that points at a file the
  media library already holds. The file is not copied.
- **Who sees it:** the shelf belongs to one person and follows them into every
  project, the same way collections do.
- **Taking a track off the shelf** removes the mark and leaves the file in the
  media library. Deleting the file removes the mark with it.
- **Two ways onto the shelf:** the plus button in the Music panel uploads a
  track and marks it in one go. Every other sound file you own is listed under
  the music with a "Use as music" button.

**Uploading sound is broken today, and the fault is in the shell.** The
shell's upload check (`validateMediaContent` in `src/server/media/library.ts`)
knows how to recognise pictures and video but no sound format, so every MP3 or
WAV is refused with "File content does not match the selected media type." The
Music panel shows that message as it is. Until the shell learns sound files,
only files already in the library, such as voiceovers, can be marked as music.

## Laying a track down

"Add under video" is one edit, so one press of Undo takes the whole lane off
again.

- **Where it goes:** a new lane at the bottom of the timeline. Nothing already
  on the timeline moves.
- **Ducking arrives on.** The lane has "Duck under voice" switched on, so the
  music drops 12 dB wherever any other lane makes a sound.
- **It starts at a quarter of its own volume.** Finished music is mastered much
  louder than speech. A sample track measured -12 LUFS against -20 for a
  voiceover (LUFS is how loud a file sounds overall; closer to zero is louder).
  At a quarter, the music sits a little under the voice between sentences and
  about 12 dB under it while somebody talks. The Volume slider on each clip
  changes it.
- **Laying a second track** adds a second music lane. The first one stays.

## When the lengths do not match

The music always covers the video from its first moment to its last. How long
"the video" is comes from the end of the last clip on any lane.

- **A longer track** is cut where the video ends and fades out over the last
  two seconds.
- **A shorter track** plays again from the top, back to back, as many times as
  it fits. A 10 second track under a 25 second video plays twice in full, then
  once more for 5 seconds with the fade on those 5.
- **A leftover piece under two seconds is dropped.** Under a 21 second video
  the same track plays twice and ends on its own last note one second early.
  Two seconds of the opening bars fading out as they begin sound like a
  mistake. The music ending one second early does not.
- **A track exactly as long as the video** plays once, with no fade.
- **An empty project** has no length to cover, so the track is laid once at its
  own length.
- **Refusals:** a track so short it would need more than 500 pieces, or a
  timeline that already has 50 lanes, gets a message instead of an edit.

## The fade

The fade is a setting on the clip, `fadeOutMs` in the saved timeline, and it
shows in the clip's Sound settings as "Fade out at the end". Any sound or video
clip can have it switched on or off there.

- **Preview and export agree.** The preview lowers the clip's volume evenly to
  nothing over the last two seconds (`clipFadeOutGain` in
  `src/lib/video/background-music.ts`). The export does the same with ffmpeg's
  `afade` on that clip before it is moved into place.
- **Trimming** the end of a faded clip moves the fade with it, because the fade
  is always the clip's own last two seconds.
- **Splitting** a faded clip keeps the fade on the right-hand piece only. The
  left piece now ends in the middle of the music, where a fade would be a dip.

## What was measured

One 30 second test export, a picture under two voiceovers, with a 12 second
sample track laid under it:

- The track landed as 12s, 12s and a 6s piece with the fade.
- Speech came out 10 to 13 dB above the ducked music.
- The last two seconds fall evenly from about -16 dB to -38 dB, with no sudden
  stop.

The sample track was a generated test tone, not real music. Real music and a
real recorded voice will measure differently, so the level is worth a listen
on a real project.
