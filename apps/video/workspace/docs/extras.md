# Extras: clothing, backdrops, props and hair

An extra is something an actor wears, holds or stands in: a clothing item, a
backdrop, a prop, or a hair and makeup look. Each one is a name, one picture
and a written description. You pick extras beside the actor in the editor's
AI clip panel, and the first frame and the shot made from it are both sent
the pictures and the words. That way the presenter keeps the same green jacket
in the same kitchen from shot to shot.

Tyler asked for this on 19 Oct 2026: "I think we should have a tab that
filters by things like clothing, backdrop etc.. so when I select an actor, we
can select a backdrop or clothing too. Add a new button here called "Extras"
and clicking on it will open a dropdown to select clothing and backdrop." His
answers to the follow-up questions set the rules below.

## The rules Tyler set

- **Where extras live:** in tabs on the Actors dashboard.
- **What one is made of:** a name, a picture and a description, and both the
  picture and the description are sent.
- **The kinds:** Clothing, Backdrop, Props, and Hair and makeup.
- **One of each kind per frame.** Picking another replaces it.
- **Making one:** pick a picture from Media, or write a description and let AI
  draw it, the same as an actor.
- **The person board:** everything worn or held is stitched into one picture
  with the actor's angles, and the backdrop goes as its own picture. Tyler's
  question was "should we make the app combine all the angles into one
  sheet?", and this is the answer he chose.
- **A board holds 4 pictures**, a 2 by 2 grid.
- **The picks are kept per project**, so a series keeps the same outfit and
  kitchen until they are changed.
- **A first frame remembers its extras**, and the shot made from that frame
  sends the same ones with no extra clicks.
- **If Google refuses reference pictures alongside a first frame:** "Stop and
  ask me." Nothing in the request changes until Tyler decides. He set this for
  Veo, and it holds for Omni Flash, which replaced Veo on 19 Oct 2026.
- **If reference pictures make a shot cost more**, the Make the shot price
  shows the higher figure and the references are still sent every time.

## The tabs

- **Where they are:** Actors in the left menu. The tabs along the top read
  Actors, Clothing, Backdrop, Props, and Hair and makeup, each with how many it
  holds. The open tab is kept in the address as `?tab=clothing` and so on, so
  a link can open one straight away.
- **Each tab** is a grid of cards: the picture, the name and the description,
  with a cog to edit and a bin to delete. A click anywhere on a card opens it.
  Search covers the name and the description.
- **Making one:** Create clothing (or backdrop, prop, hair look) opens a window
  with Name, Description and Picture. Create needs a picture picked from
  Media. Draw with AI · $0.04 draws the picture from the description with Nano
  Banana instead, and saves at once. Drawing asks for the thing on its own: an
  outfit on a plain background with no person, an empty place, an object alone,
  or a hairstyle on a featureless mannequin head, so the picture never brings a
  stranger's face along.
- **Editing one:** the same window. Draw with AI makes a new picture, and the
  old one stays in Media. The kind never changes.
- **Deleting one** removes the card and never the file, which stays in Media.
  Frames and clips already made with it keep what they were sent.
- **A file cannot be deleted from Media while an extra uses it**, the same rule
  as an actor's main picture.

## The Extras button

- **Where it is:** step 1 of the AI clip panel, under the actors, on the same
  row as New actor. When the panel is too narrow for both names, which is the
  case at its starting width, Extras drops under New actor. Dragging the panel
  wider puts them side by side.
- **What it opens:** a box with a tab for each kind: Clothing, Backdrop, Props,
  and Hair and makeup. A tab shows that kind's extras as a grid of pictures,
  three to a row, each about 105 pixels wide with the name underneath. Tyler
  chose this on 19 Oct 2026, after the first menu's 24 pixel pictures were
  "way too small" and he asked what happens with a lot of them.
- **The tabs are underlined**, words with a line under the open one, the same
  as the Project app's task tabs. Tyler pointed at those on 19 Oct 2026 and
  said "use this type of tabs". The UI rules list this box as an exception to
  the grey pill tabs.
- **A lot of extras:** the grid scrolls inside its own tab after about two
  rows, so thirty jackets never push the backdrops out of reach.
- **Search:** a magnifying glass at the right end of the tab row opens a
  search box under the tabs, which narrows the open tab by name and
  description. Escape empties and closes the search first, and a second
  Escape closes the whole box. Switching tabs empties the search too.
- **Picking:** a click picks that extra for its kind and replaces the last
  pick. The picked picture gets a ring and a tick, and a click on it again
  takes it off. The picked one sits first in the grid, in the order it had
  when the box opened, so a picture never jumps under the pointer.
- **The None box:** a small checkbox marked None sits under the grid. It is
  ticked while nothing of that kind is picked, and ticking it takes the pick
  off.
- **The box stays open while you pick**, so clothing, hair and a backdrop can
  be picked in one go. A click outside it or Escape closes it.
- **A kind with nothing in it** says "No backdrops yet. Make one", and the link
  opens that tab on the Actors dashboard.
- **What is picked:** the button says how many ("Extras · 2"), and each pick
  shows underneath as a chip with an x to take it off.
- **Changing the actor keeps the extras.** The outfit is the project's, not the
  actor's.
- **Saved as you pick:** each change is saved on the project at once
  (`video_projects.extra_picks`). Closing the panel, reloading or coming back
  another day shows the same picks. An extra deleted since drops out of the
  picks without a word.
- **A copy of the project** takes the picks with it, the same as its look.

## The person board

Google's picture model, Nano Banana, takes 3 pictures in one request. A
project's look picture already takes one of them. An actor with two angles
plus clothing, hair and a backdrop is five pictures. Stitched, it is two: the
board and the backdrop, with the look picture as the third.

- **What goes on it, in order:** the actor's angles picked in step 2 (the main
  picture first), then the clothing, the hair look and the prop.
- **How it is laid out:** a plain white 2 by 2 grid, each tile 576 by 768
  pixels, with each picture shrunk to fit its tile whole and never cropped. No
  text is drawn on it, because a model copies text. Two tiles sit side by
  side; three or four make two rows (`src/server/video/asset-factories/person-board.ts`).
- **One picture is not a board.** An actor's one picture with no clothing, hair
  or prop is sent as it is, and with no extras at all the request is exactly
  what it was before extras existed.
- **The limit is 4 tiles.** The step 2 picker and the Extras menu count
  together. A pick that would make a fifth is refused with "A board holds 4
  pictures. Take one off first." The server checks the same number before
  anything is paid for (`BOARD_TILES` in `src/lib/video/extras.ts`).
- **The board is made for each request and never saved.** The frame keeps the
  ids of what was on it instead.
- **What the prompt says about it:** "The first picture is a board of one
  person, Mia: tile 1 main picture, tile 2 their clothing (Green wool jacket),
  tile 3 their hair and makeup (Short grey bob). Draw one person, not the
  board. The second picture is the place to put Mia in: Bright kitchen." Then,
  after the actor's description, one line per extra: "Wearing: …", "Hair and
  makeup: …", "Holding: …", "The place is: …".
- **The cost:** each face on a board is smaller than it would be on its own,
  and a model may now and then draw the grid instead of one person. Nobody has
  measured how often yet; see "Not checked yet" below.

## What a first frame records

- **The extras it was sent**, in order, as kind, extra id and the picture's
  Media id (`video_first_frames.extras`). The picture's id is kept so the
  shot sends the same picture even after the extra is redrawn or deleted.
- **Under the frame's name** in the panel, after "From main picture, Side", it
  says "With Green wool jacket, Bright kitchen". An extra deleted since shows
  as "a removed extra". Frames made before 19 Oct 2026 show no such line.

## What the shot is sent

When Make the shot is pressed, each piece of the shot copies what the frame
was made from (`video_ai_generations.actor_id`, `reference_media_ids` and
`extras`). A frame from before its angles were recorded sends the actor's main
picture. Shots are made with Gemini Omni Flash since 19 Oct 2026, because
Google switches Veo off on 22 Oct 2026 (`longer-ai-clips.md`).

- **The words:** after the direction and before the first-frame sentence, one
  line for the person ("The person is: …") and one per extra, read as they are
  when the piece starts.
- **The pictures:** the first frame, then the same person board as the frame
  (or the actor's one picture), then the backdrop, in that order in the
  request. Google's tags at the top of the prompt say which is which:
  "[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2
  <IMAGE_REF_1>@Image3]". The prompt then says "<IMAGE_REF_0> is a board of
  one person from several sides and what they wear and hold: show that one
  person, never the board. <IMAGE_REF_1> is the place."
- **Every length gets the pictures.** Veo took reference pictures on 8 second
  pieces only, so a 4 or 6 second Veo shot was sent the words alone. Omni
  Flash's page sets no such rule, so every piece now gets them.
- **Size:** each reference picture is redrawn to at most 1536 pixels on its
  longest side as a JPEG before it goes, so three 4 MB photos come to well
  under 4 MB together.
- **A picture deleted from Media since** is left out. A board left with one
  picture sends that one alone, and with no picture of the person left the
  backdrop is not sent either.
- **Shots asked for before 19 Oct 2026** have no actor on record and are sent
  the first frame and the words alone.
- **The shot's row** in the panel says what was sent, such as "Mia, 3 pictures
  on one board, with Green wool jacket, Bright kitchen". A 4 or 6 second shot
  made on Veo says "words only".
- **Price:** Google bills Omni Flash by tokens, and the pictures sent are
  tokens in at $1.50 a million, a fraction of a cent a shot. The real charge
  is Google's own count.

## Not checked yet

- **Omni Flash with a first frame and reference pictures together.** Google's
  Omni page shows both in one request, but no real request has been sent: the
  local Gemini key is a free key, and Google gives free keys 0 Omni Flash
  shots a day. If Google refuses the pair, the shot fails with Google's reason
  on its row and nothing is charged. Tyler's rule is to stop and ask him then.
- **How often a model draws the board.** Part 7 of task 04 makes five first
  frames and two clips with a full board and a backdrop, for Tyler to look at
  and decide whether the board stays. It needs a paid Gemini key.

## Where it lives

- The table is `video_extras`, added by `drizzle/0124_video_extras.sql` with the
  three new columns above.
- Rules shared by the browser and the server: `src/lib/video/extras.ts`.
- Server: `src/server/video/asset-factories/extras.ts` (the extras and the
  picks), `person-board.ts` (the stitching), and `first-frames.ts` and
  `generations.ts` (what is sent).
- Screens: `src/components/video-assets/actors-dashboard.tsx` (the tabs),
  `extra-form-dialog.tsx` (the window), and
  `src/components/video-editor/ai-clip-extras.tsx` (the Extras button).
