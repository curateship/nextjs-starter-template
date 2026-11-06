# Record a voiceover

You can record a voiceover yourself, straight into the editor, without the AI
reading anything. It lands at the playhead with captions, the same way an AI
voiceover does, and it stays in the Voices list so you can use it again.

## Where it is

Sounds on the editor's left rail → the Voices tab → the **+** in its header →
**Record a voiceover**. The same + menu also holds "Read a script with AI" and
"Make a copy of my voice". Tyler asked for all three to live there on 5 Nov
2026, so everything that makes a voice starts in one place: "Clicking on the +
lets me either record my own or choose actor and voice by eleven lab". Before
that, the AI reading was the Voice tile in AI tools.

## Using it

- **Record and Stop:** Record asks the browser for the microphone, and a timer
  counts up while you talk. The take stops itself at 5:00.
- **Hearing it back:** after Stop, a player shows the take and its length.
  Record again throws the take away and starts a new one.
- **Add to video:** the window sends the take, waits for the captions, and lays
  the sound and its captions down at the playhead. One press of Undo takes both
  back off. The same message as the shelf's says where it went: "Added at 0:12,
  with 4 captions. Undo removes it."
- **A locked editor says no first.** When the window is read-only, the menu
  item and Add to video both stop before anything is sent.
- **Closing the window mid-take** lets go of the microphone and throws the
  take away. Closing with a take waiting asks before throwing it away.
- **A full project:** a project holds 50 tracks at most. When there is no room,
  the recording is still kept, and the message says it is in the Voices list.

## The file

- **The browser turns the take into a WAV file** before sending it: one
  channel, 32,000 samples a second, 16 bits. Five minutes is about 19 MB.
  `toWav` in `src/components/video-editor/record-voiceover-dialog.tsx` does it,
  and `encodeWav` in `src/lib/video/recorded-voiceover.ts` writes the file.
- **Why WAV and not what the browser records:** the browser's own recording
  (WebM in Chrome, MP4 in Safari) often does not say how long it runs, and
  jumping around in it is slow. A WAV says its length in its first 44 bytes,
  so the website can measure it without ffmpeg. The website has no ffmpeg
  (`getting-media-ready.md`). Whisper also takes WAV as it is.
- **The server checks it again:** `recordingRefusal` refuses anything that is
  not plain WAV, has no sound, or runs past 5:01. The length is read from the
  WAV's own header by `wavDurationMs`, counting only the sound the file really
  holds.
- **Where it is kept:** an ordinary sound file in the media library, plus a row
  on the voiceover shelf (`saved-voiceovers.md`), written by
  `keepRecordedVoiceover` in `src/server/video/recorded-voiceovers.ts`. The
  shelf names its voice "Your recording".

## The captions

- **Whisper writes them:** it hears what you said and when you said each word.
  The captions use the standard caption look, and the words light up one by
  one like an AI voiceover's.
- **What it costs:** Whisper charges $0.006 a minute, so a 5-minute take costs
  3 cents. It goes on the AI meter as "Recording captions"
  (`voiceover_recording`), on the video's spend line.
- **The recording is kept whatever Whisper does.** A take cannot be made again
  for free, so it is never thrown away over its captions. It lands without
  captions instead, and a second message says why:
  - No OpenAI key in Settings → AI: "Kept without captions, because no OpenAI
    key is saved in Settings → AI to write them." The window says this before
    you record, too.
  - Whisper failed: "Kept without captions, because Whisper could not write
    down the words this time." OpenAI answering HTTP 429 lands here.
  - Whisper heard no words: "Kept without captions, because Whisper heard no
    words in it."
- **The words on the shelf** are what Whisper heard, so the Voices search finds
  a recording by what was said. A recording with no captions has no words, and
  the list shows it as "Voiceover".

## It is never counted as the AI's

The list of what the AI made in a video (`say-what-ai-made.md`) counts every
voiceover on the shelf as an AI voice. A recording is your own voice, so it is
left out: `workOutAiParts` in `src/server/video/ai-parts.ts` skips the shelf's
`own-recording` voice.
