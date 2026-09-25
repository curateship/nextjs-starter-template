# Saved voiceovers

Every voiceover the studio reads aloud is kept on a shelf with the words it
said. The Voiceovers panel on the studio rail (the microphone, labelled
"Voices") lists them, and one press lays one into the project you are in.
Reusing a voiceover costs nothing. Only reading new words spends ElevenLabs or
OpenAI characters.

## What is kept alongside a voiceover

- **The file:** the sound itself is an ordinary row in the media library, the
  same as before. Nothing about the file changed.
- **The shelf row:** a row in `video_voiceovers` (migration 0083), keyed by the
  file's media id. It holds the words that were read, the voice's id and name,
  how long it runs, and the caption lines with each word's time.
- **Why a table beside the file and not new columns on it:** the `media` table
  belongs to the shell, and an app editing a shell table forks it for every
  future merge. The music shelf (`video_music_tracks`) is built the same way.
- **Written in one go:** the file's media row and the shelf row are written in
  one transaction in `src/server/video/voiceovers.ts`. There is never a
  voiceover file the shelf does not know about, or a shelf row with no file.
- **Every way of reading aloud lands here:** the "Read this aloud" window, a
  rewritten opening line, and a translation read aloud all go through
  `speak()` in `src/server/video/voice.ts`.
- **Who sees it:** the shelf belongs to one person and follows them into every
  project, like the music shelf and collections.

## The list

- **Each row shows** the words that were said (up to three lines), the voice's
  name and the length, with a play button to hear it first.
- **Search** matches any part of the words, or the voice's name, ignoring
  capitals. "next week" finds "Thanks for watching, see you next week."
- **Order:** newest first. The panel shows the newest 100. Anything older is
  reached by searching for it.

## Laying one down

"Add at playhead" is one edit, so one press of Undo takes it all back off.

- **Where the sound goes:** a new lane at the bottom, starting at the playhead.
- **The captions come with it**, the same way they do with a fresh voiceover:
  a new lane at the top, each line moved along by the playhead's time. A
  voiceover laid at 0:05 whose first line starts 1.2 seconds in shows that
  line at 0:06.2.
- **Words that light up one by one** still light up, because each line keeps
  its word times.
- **The captions take today's caption look** from the brand kit, not the look
  from when the voiceover was first made. The look is not part of what is kept.
- **A full project says no.** A project holds 50 tracks at most, and a save
  refuses more. A voiceover needs two new tracks (one if it has no captions),
  so at 49 tracks the press shows "This project already has 50 tracks, the
  most it can hold" and changes nothing. A fresh voiceover or translation that
  hits the limit after it was read says the same, and adds that it is saved
  in the Voices panel, because it was already paid for.
- `voiceoverClips` in `src/lib/video/saved-voiceovers.ts` builds the clips for
  both a fresh voiceover and a reused one, so the two cannot drift apart.

## When a voiceover's file is deleted

- **The shelf:** the shelf row is deleted with the file, by the database
  (`ON DELETE CASCADE`). It drops off the list the next time the panel loads.
- **Projects already using it:** the clip is an ordinary sound clip, so it
  behaves like any sound whose file has gone. It stays on the timeline, it
  plays nothing, and exporting stops with "A clip's file is no longer in the
  library" until the clip is fixed or deleted.
- **A panel that was open before the delete** still shows the row. Its play
  button then says the file may have been deleted.

## Voiceovers made before the shelf existed

- **They are not on the shelf.** The words and the voice were never kept for
  them, so there is nothing to list or search.
- **Nothing about them broke.** Their files are untouched, still sit in the
  media library as sound files, and still play in every project that uses
  them. They can still be marked as music or dragged in from the Media panel.
