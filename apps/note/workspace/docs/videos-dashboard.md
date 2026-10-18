# The videos dashboard

`/videos` is where a person keeps the videos they want to learn from. It is one
screen of three panels: their folders on the left, their videos in the middle,
and the picked video playing on the right with what the AI wrote about it.

## Who sees what

- **Every signed-in member gets in, not only admins.** Tyler asked for that on
  17 Oct 2026. The shell's `/admin` layout turns non-admins away, so the screen
  lives at `/videos` under `_authenticated` (`src/routes/_authenticated/videos.tsx`).
- **Each person sees only their own videos and folders.** Every query in
  `src/server/note/` is scoped to the signed-in person, including the search,
  so one person never sees another's titles or words.
- **The Videos link in the left menu** was added to every saved menu by
  migration `0097_note_videos_menu.sql`: each site's admin menu and the members'
  menu, right after the first entry of the first section. A menu that already
  links to `/videos` is left alone. A menu that has never been saved has nothing
  to add to, so a brand-new install gets the link from Settings → Navigation.

## The address

`?folder=<id>` (or `?folder=none`) is the folder showing, and `?open=<id>` is
the picked video. Both are written as the person clicks, so a reload, a shared
link or a bell notice comes back to the same place. Picking a folder or a video
never reloads the page; the screen asks for what it needs itself.

## Left panel: folders

- **"All videos" and "No folder" sit at the top**, each with its count, then the
  person's folders in the order they dragged them.
- **Clicking a row narrows the middle panel in place.** Clicking the picked row
  again widens it back to all videos.
- **The + in the header makes a folder.** A name already taken is refused with
  "A folder with that name already exists". Names are compared with capitals and
  extra spaces ignored, so "Pricing" and " pricing " are the same name.
- **The cog renames a folder in place.** Enter saves and Escape cancels. A name
  already taken turns the box red and keeps what was typed.
- **The bin deletes a folder through the confirm.** Its videos stay on the list
  in no folder; only the folder goes, and the confirm says how many.
- **The grip drags a folder up or down.** The list moves at once and the order
  saves when it is dropped. A refused save puts it back.
- Folders are a flat list and a video is in one folder at most. There are no
  folders inside folders.

## Middle panel: the videos

- **One row of controls** under the header: the paste box with Save, Upload,
  the search box, and the list/grid pair. On a narrow panel the row wraps rather
  than squeezing a control out of sight.
- **Grid is the default.** The choice is remembered per browser under the app's
  own key `note-videos-view` (`src/lib/note/view-key.ts`).
- **Each card shows** the cover (or a sound mark for a sound file), the title,
  the site's mark, the length, and where the video has got to. Once analysed it
  also shows the first line of the summary, the tags, a Done tick when every
  step of the action plan is ticked, and the first line of the person's note.
  A plan with nothing to tick never shows Done.
- **The status words** are Downloading…, Uploading 42%, Ready to analyse,
  Queued, Transcribing…, Summarising…, Analysed, and Failed: with the reason.
  Anything still moving has a spinner beside it.
- **A failed card has Try again** when there is something to try again with: a
  link is downloaded again, and a video whose file is still there is analysed
  again. An upload whose file has gone says to upload it again instead.
- **The ⋯ menu** moves the video to a folder or to No folder, and deletes it
  through the confirm ("This removes the video, its cover and its analysis from
  your library. The original stays on YouTube.").
- **Search** waits 300ms after the last keystroke, then asks the server, which
  reads titles, tags and every transcribed word. The list is replaced by the
  answer, or says "Nothing matches".
- **Fifty cards at a time**, newest first, with Show older at the foot.
- **A new video always shows where it landed.** A link saved or a file uploaded
  while a folder or a search is showing switches the middle panel to All
  videos, because a new video is in no folder and may not match the search. The
  new video is picked, so the right panel follows it.
- **While any card is moving**, the panel asks where those cards have got to
  three seconds after each answer, in one request, so two asks are never in the
  air at once. It stops when nothing is moving. A card missing from the answer
  has gone (deleted, or folded into the same video saved earlier) and leaves
  the list. When that card was the one open on the right, the right panel
  closes and says the earlier copy is kept.
- **The asking waits only on its own answers.** Typing a note or the right
  panel's own updates never restart its three-second wait.

## The sample

With no video saved at all, the middle panel says "Paste a link above to save
your first video" and shows one made-up card with a Sample badge: a two-minute
talk about pricing a first product. Its cover is `public/note/sample-cover.jpg`
and everything else is the constant in `src/lib/note/sample-video.ts`. It is
never saved, sent or fetched, so the right panel can be looked at full the
moment the app opens. Ticking one of its steps or typing a note changes the
screen only, and a hover on its checkboxes says so. Once a real video exists
the sample is gone.

## Right panel: the video

- **Every source plays the same way**, in the app's own player, from the file
  the app saved: `<video>` for a video, `<audio>` under a sound mark for a sound
  file. That is why a transcript line can jump the player to its second.
- **Under the player** sit the site, the channel, the length, the posted date
  and a link out to the original, which opens in a new tab.
- **The Analyse button** has its price above it. See `analysing-a-video.md`.
- **The cards** are the shell's grey `InspectorCard`s, in this order: Your note,
  Summary, Action plan, Key quotes, Transcript. Each remembers whether it is
  open, and the header button shuts or opens them all.
- **Your note** saves itself 700ms after the last keystroke and at once when
  the box is left. Shutting and opening its card keeps what was typed. The header says Saving… and Saved, the way every
  auto-saving screen in the shell does.
- **Action plan** steps tick off and the tick saves at once. Each tick is
  written as one change to that one step, so two quick ticks never undo each
  other. The card in the middle gets its Done tick without a reload.
- **Key quotes and Transcript lines are buttons.** Clicking one jumps the
  player to that moment. The line being played is lit and kept in view.
- **Delete video** sits at the foot of the panel, far left, through the same
  confirm as the card's menu.

## On a phone

Below 1280px the three panels become three tabs: Folders, Videos, Video. All
three stay mounted and the hidden two are `inert`, so switching tabs keeps each
panel's scroll and loaded list. Picking a card switches to the Video tab, and
the arrow in its header goes back to Videos. Picking the same card again from
the Videos tab opens it again. A page opened from a notice starts
on the Video tab.

## Where it lives

- `src/components/note-videos/`: the screen. `videos-page.tsx` holds the state,
  `three-panels.tsx` is Project's `ThreePanels` with this screen's sizes (left
  18%, middle 52%, right 30%, remembered under `note-videos-horizontal`).
- `src/lib/api/note/`: the server functions, all on `userGet`/`userPost`.
- `src/server/note/`: the tables (`schema.ts`), the reads and writes, and the
  worker.
