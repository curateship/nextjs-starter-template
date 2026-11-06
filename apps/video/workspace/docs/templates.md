# Templates

A template is a saved set of instructions the AI follows every time it makes a
video of one kind: what the video is, who it is for, how long it runs, how it
looks and sounds, and what happens once it is made. Tyler, 5 Nov 2026: "what
template is-is a set of instructions for Ai to follow. For example: I create
"Work with me" template, in that template I discribe what that template is,
reffrences, video lenght, style etc..."

A video gets a template and a script, and Brief to video turns the two into
scenes on the timeline. The task is `workspace/tasks/templates/01-templates.md`.

## Where it is

- **The Templates button** on the editor's left menu, after AI tools. Brief to
  video and the Script tile moved here from AI tools on 5 Nov 2026 (Tyler: "Lets
  call plan "Templates""). A guest sent from Project has no Templates button.
- **The panel** shows the open video's card first, "This video", then "Your
  templates".
- **The Template button in the editor's header,** between Share and Export,
  shows the video's template by name, or "Template" with none. Tyler, 5 Nov
  2026, in steps: "Clicking on the video should show the template in the
  inspector panel and I should be able to change template with a dropdown",
  "the inspetor should have all these options to change", "actually move that
  into a dropdown here ... with a button dropdown with the name of the
  template showing", then, of the old "This video" card, "this should be
  there. Aslo add a sticky footer with the "Generate video" button", "remove
  these buttons in the dropdown" (Pin, Duplicate, Delete) and "All of these
  should be open via a settings cog here clicking on it opens a modal".
  - **Everything in the dropdown is for this video only.** Tyler, 5 Nov 2026:
    "changing anything in the dropdown is ONLY for the the currant video. The
    only way to change the template is by clicking here [its cog in the
    Templates panel]. selecting a template is just applying the parameters to
    the currant video".
  - **Picking a template copies its settings onto the video,** every one of
    them, replacing what the video had. Editing the template afterwards never
    reaches a video that already picked it; picking it again copies it again.
  - **The dropdown** holds the template picker with a cog beside it, the
    script box, the storyboard line, and Make it a carousel too. Its "Write
    it for me" tab came off on 5 Nov 2026 (Tyler: "Remove the write it for me
    tab ... that is already in the "Intructions" in the modal").
  - **Generate video** sits in a footer that stays at the dropdown's foot
    while the fields scroll. It is what Brief to video was: it writes the
    scenes and opens the storyboard, where Make it makes the video.
  - **The cog** opens "This video's settings" in a window: the video's copy
    of the template's settings, one folding card per setting like every
    other settings window ("each of the settings should be the regular cards
    with collapseble like other modals"), each saving itself onto the video
    only, and Done. The template's name, references and Try it belong to the
    template and are not in it. A card remembers whether it was left open or
    shut. The server checks these the way it checks a template's: an actor,
    intro, outro or music track must be the person's own, and references
    only ever come from the template when it is picked.
  - **The template itself** is edited only from its cog in the Templates
    panel, a folding menu with every row, then Pin, Duplicate and Delete.
  - **The Templates panel** now only lists the templates. Its "This video"
    card moved into this dropdown.
  - The rows are one editor drawn in both places (`TemplateEditor` in
    `template-menu.tsx`). The pick is shared with the panel through one store
    (`template-store.ts`), so a change in either shows in both at once. A
    guest has no button.
- **The inspector's Project card is gone** (Tyler, 5 Nov 2026, pointing at it:
  "remove this card"), and so is the "Select a clip on the timeline to edit
  it." line above it ("remove this"). With no clip picked the inspector now
  shows the video's stats and the AI budget (Tyler: "This panel should now
  show all the video stats. Move this Ai stats there"):
  - **This video:** shape, size, length, clips, lanes, the AI spent on it,
    its spend limit, the whole project's total, and the spend by tool.
  - **AI budget:** what is left this month, what was spent of the
    allowance, and the last five calls. It was the "$20 of AI left" button
    in the editor's header until then.
  - **Progress bar:** only once the Elements panel has put a bar on the
    video. Tyler asked for it off by default; its settings live nowhere
    else, so it comes back when there is a bar to set. It showed the shape, size, length and the video's AI
  spend. The video's spend limit is still in Project settings, from the cog
  on the projects list.
- **New video** offers "Start from": From scratch, or one of your templates. A
  template sets the shape from its platform (9:16 for Shorts, TikTok and Reels,
  16:9 for YouTube) and the video opens on the Templates panel with it picked.
- **Code:** the panel is `src/components/video-templates/`, the shapes and
  rules are `src/lib/video/templates.ts`, the list and saving are
  `src/server/video/templates.ts`, and writing a video from a template is in
  `src/server/video/briefs.ts`.

## No windows

New template and editing a template are dropdowns, never centred windows
(Tyler: "New plan and new video gets a dropdown instead of modal", "Click edit
should open a dropdown to edit template").

- **New template** is the + in the panel's header. It asks for a name and how
  to start: Blank, Write it with AI (one sentence in, every field drafted,
  about a cent), From a video in this project (the AI reads what it says, its
  length and its clips), or From a reference video that is broken down.
- **Editing** is the cog on a template's row. It opens the shell's folding
  menu: one row per thing the template holds, each saving itself 700ms after
  the last change, then Pin, Duplicate and Delete under the line. Delete asks
  first.
- The storyboard is still a window, as it always was.

## What a template holds

- **Instructions:** the first card, and the only text the AI writer reads.
  It is the whole of what the writer is told when it turns the script into
  scenes, and it is edited directly (see "The Instructions card" below). It
  replaced four cards on 5 Nov 2026: What it is, What the AI reads (with its
  Script template and Instructions tabs), Picture style and Rules (Tyler:
  "There is too many redundency here", then "we can remove the rules and
  style card too, we can already set that in the instructions").
- **Platform and length:** a pasted script runs its own length (Tyler picked
  "Your script wins"); the length sets the typical price. On Shorts, TikTok
  and Reels it is in seconds, 15 to 180. On YouTube it is in whole minutes,
  1 to 30 (Tyler, 5 Nov 2026: "if I select youtube, this should be minutes").
  It is kept in seconds either way; switching to YouTube rounds it to whole
  minutes, at least one.
- **Pace:** fast is 2 to 4 seconds a scene, normal is 3 to 8 on a short
  platform and 5 to 15 on YouTube, slow is 8 to 15.
- **Voice:** a voice and its quality, or the usual voice saved in the Read a
  script with AI window. With neither, Brief to video says so.
- **Pictures:** the picture model, and one actor (Tyler picked "One actor").
  The writer marks each scene that shows the person, and those pictures are
  sent the actor's main picture and up to two more from the character sheet.
- **References:** up to 6 of four kinds, pictures from Media, videos from
  Media, Viral originals and links to YouTube, TikTok or Instagram videos.
  Pictures go with every picture, up to 3 a scene. The three kinds of video are
  broken down shot by shot once by the saved-video job, and the finished
  breakdown goes into the instructions. One still being broken down is left
  out and named under the Instructions card. A link alone is never sent as though
  the AI could watch it.
- **Captions:** on or off, in the look from Settings → Captions or the
  template's own.
- **Music:** none, a track from your Music list, or AI music to a mood. It is
  got ready when Make it is pressed and goes under the whole video, on a lane
  that ducks under the voice, in the same step as the last scene.
- **Intro and outro:** the template's own, from this project's Media. They are
  written onto the video at Make it, and an export uses them before the
  project's (`intro-and-outro.md`).
- **Languages:** up to 5. Once the video is made, each becomes a new video in
  the project, "Bread (Spanish)", with every scene's words translated and read
  again, the same pictures and the same music.
- **Spending cap:** the most one video may cost, empty until set (Tyler's
  pick). It counts the scenes, the AI music and the language copies' voices.
  Make it refuses above it and says by how much.
- **No status setting.** A video made with Generate video stays Draft, like
  any new video (Tyler, 5 Nov 2026: "A new generate video is always draft").
  The "When it's made" card that set a status was removed the same day, and
  with it the To review status it had added (Tyler picked "Remove it").
- **Tags:** your own, with a comma between. The list filters by them.

Everything the AI follows is one JSON object on the template's row, read field
by field: a field that no longer reads falls back to its default on its own.

## The three starters

Work with me, Day in my life and Tips list (Tyler's pick). They are made for
each person the first time the panel opens, and a row in
`video_template_starts` stops them coming back once deleted.

## The video's fields, in the header's dropdown

- **Template:** pick one for this video.
- **Script:** the pasted script. "Write it for me", a one-line idea the AI
  wrote the script from, was removed on 5 Nov 2026, server and all.
- **The script box** saves itself with the video. A draft sent from Viral
  opens with its script already in it (`viral-connection.md`).
- **Scene breaks:** a blank line or `---` starts a new scene. Without breaks
  the app cuts at sentence ends, aiming at the pace's middle length, and never
  splits a sentence. Every word stays, in order.
- **Picture notes:** `[show: me at my desk with coffee]` becomes that scene's
  picture and is never read aloud.
- **This video's settings** are its own copy of the template's, changed from
  the cog beside the picker. Until 5 Nov 2026 only length, pace, voice and
  style could be changed per video, behind "Change it for this video only",
  then for a few minutes straight in the dropdown, before Tyler settled that
  the whole dropdown is per video and picking copies the template.
- **Pick the hook and Hear it** were built and then taken out on 5 Nov 2026
  (Tyler: "Remove the pick a hook and hear it feature").
- **Generate video:** writes the scenes and opens the storyboard, priced on
  the button. With a pasted script the writer only names the video and writes
  each scene's picture; the words are yours. Then Make it, as before
  (`brief-to-video.md`).
- **Make it a carousel too:** the script as a carousel in a carousel project
  you pick. It shows on this project's Carousels card.

## Each template in the list

- **Cover:** the first picture of the newest video made with it, or its first
  reference picture.
- **Price:** about what a video made with it costs: a picture a scene at the
  pace's middle length, the voice by the character at 170 words a minute, AI
  music, and each language's voice.
- **Try it**, in the edit dropdown: a sample script runs to the storyboard
  only. Nothing is saved and no pictures are made; only the writing is paid
  for, on the open video.

## The Instructions card

- **What it is:** everything the AI writer is told when it turns the pasted
  script into scenes, as one text box. In this video's settings it is the
  video's own; from the template's cog it is the template's.
- **It starts on the app's own wording,** built from the template's
  description, audience and finished reference breakdowns, with `{{scenes}}`
  where the script's scenes go. A new template's starts from its
  description; the three starters' descriptions end with how their pictures
  look.
- **Once typed in, it is sent as written.** "Use the app's wording" goes back.
- **Picture style and rules go in the text.** Whatever it says about how the
  pictures look shapes each scene's picture direction, and the project's own
  look still goes with every picture. The template's separate style line and
  its rules check after writing were removed.
- **The answer's format is not in the box.** The app adds it after the text
  every time, so the reply can always be read. A reply that still comes back
  garbled is asked for once more; a missing key fails at once. Text that drops `{{scenes}}`
  gets the scenes added at the end under their own heading.
- Kept as `scriptPrompt` on the settings; the description stays as
  `instructions`, which the app's own wording is built from.

## After the video is made

- **The bell rings** when the last scene lands, naming the template and any
  language copies, and when a scene fails.
- **Changing a scene's words** on the storyboard of a made video and pressing
  "Make changed scenes again" reads only those scenes again. Each new reading
  goes where the old one was, its picture grows or shrinks with it, and the
  later scenes on the brief's three lanes move by the difference. Other lanes,
  the music included, stay. It is one Undo step.

## Where it is kept

`drizzle/0155_video_templates.sql`:

- `video_templates`: one row per template, the person's own.
- `video_template_starts`: when a person's starters were made.
- `video_briefs` gains the template it came from, the settings it was made
  with (the video's copy), what was typed, and what happened once it was
  made. Editing or deleting a template never changes a brief
  already written.
- `video_project_videos` gains the template picked, the script box, the
  video's copy of the template's settings (`template_changes`, read field by
  field; a video picked before copies existed falls back to the template's
  for anything missing), and the template's own intro and outro.

## What has not been run

- **No real AI call.** The writer, the pictures, the voices, the music and the
  breakdowns were run in tests with stand-ins. The local Gemini key is a free
  key that refuses pictures (`brief-to-video.md`).
- **The panel at its narrowest** was measured at 1440px wide in a real
  browser, and the select boxes were made to shrink after that measurement;
  the fix was not measured again.
