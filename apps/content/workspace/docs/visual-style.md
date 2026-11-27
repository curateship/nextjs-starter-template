# A project's look

A project can carry one written style and one look picture, and every AI
picture or clip made for that project starts from them. Scene three then looks
like it belongs with scene one, instead of drifting from photo to cartoon to 3D.

## What the look is

- **The style line:** up to 500 characters describing how things look, never
  what happens. "Flat illustration, warm palette, thick outlines, no text" is a
  style line. "A woman pours coffee" is not, because that belongs to one scene.
- **The look picture:** one picture from the Media library. The AI copies its
  colours, light and drawing style, not what is in it. It is optional.
- **Where it is set:** the project's Settings window, from the cog on its row
  of the projects list (`src/components/video-editor/project-form-dialog.tsx`).
  The same window holds the project's name. The editor has no Look button:
  Tyler moved the look there on 12 Oct 2026.
- **Where it is kept:** two columns on the project row, `video_projects.style`
  and `video_projects.style_media_id` (migration 0110). They sit beside the
  timeline, not inside it, the way the name does. Saving the look therefore
  never moves the timeline's version, so an editor that has the project open
  keeps saving instead of being told another window saved first.
- **What a copy keeps:** duplicating a project copies its look, which is how
  the next video in a series starts from the same one.
- **What it costs:** the look itself costs nothing, and the style line is a
  few words on a request that was being paid for anyway. A look picture is one
  more picture sent with each picture request, and Google and OpenAI bill a
  sent picture as input, which is small next to the price of the picture made.

## Which tools read it

- **AI videos (Gemini Omni Flash):** every clip made for a project gets the
  style line in its prompt, right after Google's tags naming the first frame
  (`videoPrompt` in `src/server/video/asset-factories/generations.ts`). The
  style is read when each piece starts, so a piece started after the style
  changed uses the new one. The shot is sent the first frame and no look
  picture.
- **First frames:** a first frame is made inside a project, on the editor's
  AI clip panel, so it always takes that project's look without asking. The
  panel says which look it will use before the button is pressed (see
  `ai-clip.md`). Nano Banana takes 3 pictures a request in all, so a look
  picture leaves room for 2 of the actor's sheet pictures (`actors.md`).
- **Actors:** an actor is shared across projects. Made from the AI clip panel,
  it takes the open project's look. Made on the Actors dashboard, its window
  has a "Project look" choice that lists only projects with a look. Either way
  the look is not kept on the actor.
- **How a request is built:** `withLook` and `styledPrompt` in
  `src/lib/video/visual-style.ts`. The prompt starts with `Style: <the line>`,
  then one sentence naming the look picture when one is sent, then the
  request's own prompt. With no look the request is exactly what it was before.
- **A picture made to move:** Make it move on a timeline picture is an AI
  video like any other, so it gets the style line in the same place and no
  look picture. Its window shows the line as "Sent with it"
  (`animate-a-still.md`).
- **Brief to video:** every scene's picture is made with the style line and
  the look picture, read with `readProjectLook` in
  `src/server/video/project-look.ts` and built with `withLook`, and so is a
  scene's picture made again (`brief-to-video.md`).

## When the look picture is gone

- **Deleting the picture blanks the column.** The style line stays, and the
  next picture request goes out with the style alone.
- **Somebody else's picture is refused.** Settings only keeps a picture that
  is the owner's own, and the AI tools only ever read the owner's own Media.

## Why a bad style line spoils every scene at once

The style line is the first thing in every request for the project, and the
models weigh the opening of a prompt most. One wrong word there is in all
twelve scenes, not one. "Photorealistic" in a cartoon project turns every still
into a photo. "Bright" with a night scene fights the scene every time.

- **Try it on one picture first.** Make one first frame with the project's
  look before generating a whole storyboard from it.
- **Keep it to the look.** Actions, places and people go in each scene's own
  direction, which comes after the style line.
- **Say what never appears.** "No text" in the style line is cheaper than
  remaking every still that came back with a made-up sign on it.
