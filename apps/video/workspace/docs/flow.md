# Flow

A flow is a template you build from nodes on a canvas. Running it walks the
nodes one by one and ends with a video in a project. Tyler, 14 Nov 2026: "I
build the templates using the nodes and then when I run the flow, it will go
through each node step by step to build a video."

The task is `workspace/tasks/flow/01-flow-dashboard.md`. It is not the older
plan in `workspace/tasks/#maybe/flow/`, which copied one viral video in fixed
steps (Tyler: "Its a totally a different type of plan. Our is canvas based and
more flexibile").

## Tyler's rules

- **An AI node does only what its prompt says.** "No specific things ai should
  do. That should be compltely based on the prompts I give it." The app adds
  nothing about what to do. It adds only what is connected to the node, and
  the shape the answer must come back in so it can be read.
- **A node reads whatever has a line into it.** He picked "Draw a line from
  each". Many lines can go into a node and out of it.
- **"Wait for my OK" is a switch on each AI node**, set while building.
- **The project is the last step.** Of the project box that was under Run:
  "this should be removed. its the last step". Run starts the run at once;
  the guide's last step, Save to a project, picks where it goes.
- **A run is a stepped guide.** "the way it was now is NOT stepped guide. This
  is how it should look", with his picture
  (`assets/pasted-image-1794672552219558000.png`).
- **A step is a node that makes something.** "paste a transcript is not a
  step. Generate a script is." "Have a step just to paste the transcript is
  making is unnessarryly long."
- **A node holds what it asks you for.** There are no nodes that only ask for
  something. What a node needs from you, such as a transcript or a raw video,
  is a box set inside it, the way an automation's Send email holds its own
  email (Tyler, 14 Nov 2026: "even the other canvas dashboard does not have
  nodes for a single use like you did here"). A line only carries what one
  node made into the next ("what does the text have anything to do with ai
  video").
- **An AI step runs when its button is pressed.** He picked "At each step's
  button", and pointed at "Generate script" in the footer.
- **Each step's words are written per node in the builder.** He picked
  "Written per node in the builder". "Mark as done" from the picture is left
  out, his pick.
- **No dollar limit on a flow.** He picked "No, project's limit is enough".
- **The panels copy Admin → Pages**: "Look at how admin > pages handles its
  panels".

## Where it is

- **The left menu's Flow link**, straight after Video editor, at
  `/admin/video-flow`. Admins only. Migration `0174_video_menu_flow.sql` adds
  it.
- **Left panel:** your own page of "/" blocks, as Admin's and Automations'
  left pages are (the Admin 3 panel design). It holds the fixed Dashboards
  block with a row each for Flows and Runs and their counts; the block's ⋮
  hides a row or drags the rows into a new order, and moves the block up or
  down. The header has the + that makes a flow and the page's ⋮: Cover photo,
  and Lock the notes. The cover carries on behind the right panel's header.
  Migration `0175_video_flow_pages.sql` keeps the page, one per person.
- **Flows, middle:** a table of flows with a search box and New flow. A press
  on a row opens the builder, and the row's cog shows the flow on the right
  (Tyler, 14 Nov 2026: "clicking the flow in the table goes straight to the
  canvas. Only clicking on the settings cog opens the right panel"). Beside
  the cog, a copy button duplicates the flow ("For flow table, add a
  duplicate function"), then the bin deletes it.
- **Flows, right:** the flow's name and description, saved as they are typed,
  how many runs it has had, and how many things stop it running. The footer
  has Run and Edit flow, as a page has Open and Edit page. The ⋮ is the tabbed
  menu a page's is: General with the flow's nodes, runs and last run, then
  Duplicate and Delete flow.
- **A flow or run that is gone:** an address naming a deleted flow or run,
  such as the place the dashboard remembered from before it was deleted,
  opens the Flows or Runs table and drops it from the address, rather than
  failing with "Flow not found".
- **Runs, middle:** the shell's table of every run, newest first, with its
  project, how many steps are done, what it has cost and its state. A press
  opens the run's steps page; the row's cog shows the run on the right and
  its bin deletes it. Select, in the header or the right-click menu, ticks
  runs to delete together (Tyler, 14 Nov 2026: "add an action col for the
  runs table with mass select"). There is no New button, because a run only
  comes from Run.
- **Runs, right:** the run's name, saved as it is typed ("need ability to
  edit the run like title"), then its steps done, project, spend and start.
  A run starts with its flow's name; its bell, its files and the video it
  saves are named after the run's name, so a new name applies from then on,
  and a blank one keeps the old. The footer has Open the run; the ⋮ has
  Delete run.
- **Deleting a run** takes its steps with it. The files it made stay in
  Media, its cost stays on the meter, and a video it saved stays in its
  project. A run with a step being made right now is refused ("Stop it, or
  wait for that step to finish"), all or none, so the worker never writes
  into a run that is gone. Its AI picture jobs' rows go with their step
  (`0177` links them with ON DELETE CASCADE).

## The builder

Edit flow flips the middle in place, as Edit page does on Admin → Pages.

- **The nodes panel** sits beside the canvas as an automation's step list
  does: the button that shuts it at its outer edge, then its name, Nodes. It
  lists AI text, AI video, AI thumbnail, AI picture, AI voice and AI music.
  A press on a card only shows
  the node on the right, marked "Not on the canvas yet", where its title and
  prompt can be written first; Add node at the panel's foot puts it on the
  canvas (Tyler, 14 Nov 2026: "clicking on a node should not add it"). The
  card's + adds it in view at once, and dragging drops it where it lands, as
  an automation's step list does. A double-click on its blank space
  shuts it too, and the canvas header's button brings it back. It opens at
  Settings → Styling → Side panels → Automation step list width.
- **The canvas header** is shaped as an automation's: an arrow back to the
  Flows table (Tyler, 14 Nov 2026: "add a back button here to go back to the
  table"), the flow's name, whether it is saved, then Run and the ⋮ with
  Duplicate and Delete. Leaving saves any change still waiting. The arrow
  stays in this header, not in a side panel ("move the arrow back to the
  middle panel").
- **Run** shows no spinner and doesn't grey out while the run starts ("remove
  the loading indicator in the run button"). A second press meanwhile is
  ignored, so it never starts two runs.
- **The canvas** is the shell's automation canvas, drawing Flow's nodes. Drag
  from a node's dot to another node to draw a line.
- **The right panel** shows the picked node, in the shell's panel cards:
  - **Node:** its title, prompt, "Wait for my OK", and about what it costs.
  - **Asks you for:** the boxes its step asks you for, in order, each with
    the name shown over it on the step and a bin that removes it. The card's
    + adds one, up to six: Text, Video upload, Pick from Media, Video link,
    or Actor or voice. The grip on a box's left drags it up or down (Tyler,
    14 Nov 2026: "i want to drag and drop this"), and the step shows the
    boxes in that order. Only the grip drags, so typing a name never moves a
    box. A run already going keeps the order it started with.
    Each box has a **Can be left empty** switch: on, the step's button works
    with that box empty, the step's card says "Can be left empty", and the
    node gets nothing from it. The Pomodoro starter's "Your scene" is one:
    the AI editor animates your own picture when you pick one, and the AI
    picture when you don't.
  - **Guide:** its step's words: Heading, Short line, Explanation, Tip and
    Button.
  - **Lines:** what the node reads from and hands on to. With no node picked, the right panel shows the
  flow's name and description and anything stopping it running.
- **Saving:** every change saves 0.7 seconds after the last one. The header
  says "Not saved yet", "Saving…" or "Saved". A save from an older copy of the
  canvas, such as a second window, is refused and says so, so it never writes
  over the newer one.
- **What stops a flow running**, marked in red on the canvas: no nodes, an AI
  node with an empty prompt, a node in a loop, and a node Flow doesn't know.
  Run stays pressable and says the first of these when pressed.
- **On a phone** the nodes panel is a + in the canvas header.

## The starters

The flows in the table are the templates (Tyler, 14 Nov 2026: "the flows are
the templates"). Each starter (`FLOW_STARTERS` in
`src/lib/video/flow/starter.ts`) is put in a person's Flows table once, the
first time it is read after the starter exists, and is an ordinary flow from
then on: changed, duplicated or deleted. A row per person and starter in
`video_flow_starts` (drizzle/0179) stops a deleted one coming back. New flow
makes a blank canvas, with a name and nothing else; a flow built from another
is a Duplicate of its row. A starter is only nodes and prompts; there is no
code for any kind of video. Tyler, 14 Nov
2026: "We shouldnt be building a node for every video type. The parameters,
data or instructions should just be a prompt Ai can use on existing video
editors tools".

- **Transcript to video** is Tyler's first example in three nodes: AI text
  "Generate a script", which asks for the Transcript and has Wait for my OK
  on, then the AI editor "Make the video", which asks for the Raw video and
  reads the script, then AI thumbnail. Its guide has three steps and Save to a
  project, with the words of Tyler's picture on Generate a script: "Script",
  "How the AI reads your transcript", the explanation, the tip about speaker
  names and timestamps, and the button "Generate script".
- **Pomodoro study video** (`workspace/tasks/flow/02-pomodoro-flow.md`) is a
  three-hour study video like Study Pomodoro's "25/5 Pomodoro Timer | Cozy
  Coffee Shop with lofi": AI picture "Café window", then the AI editor "Make
  the study video", then AI thumbnail. His answers are all in the prompts: a
  ring timer with FOCUS or BREAK and the round, a new lofi track each focus
  round, rain only in the breaks, rain all the way, a chime at each change,
  the loop on Seedance at 1080p, nothing on the video but the timer, and the
  thumbnail like the reference in Fredoka. The AI editor has Wait for my OK on,
  so it shows its plan and price first, and a "Your scene" box that can be
  left empty: his own picture when he picks one, the AI café otherwise. The
  thumbnail comes after the AI editor, which hands on the picture it
  animated, so the thumbnail uses whichever scene the video used.

Every starter's prompts are a start meant to be rewritten.

## A run

- **Run** starts the run at once, with no project, and the middle flips to
  its stepped guide. Nothing goes into a project until the guide's last step
  (Tyler, 14 Nov 2026: "Flow should not create draft until it is saved", then
  of the project box: "this should be removed. its the last step").
- **Before it is saved,** AI video keeps its cut on the run, and AI
  thumbnail makes its picture from a frame of that cut. Uploads and the
  files the AI makes are in your Media, on no project's shelf yet.
- **Save to a project,** the last step, opens only once every step before it
  is done (Tyler, 14 Nov 2026: "why am i able to save a project if the steps
  are not done?"). Until then its panel says which steps are still to do and
  has no button, and the server refuses an early save: "Finish every step
  first; saving into a project is the last step." Once open, the middle lists what gets saved
  (the video, the files, the thumbnail), and the right panel has the Project
  box and Save to project at its foot. Saving makes the project's video from
  the cut, named after the flow, puts every file the run was given or made
  on the project's Media shelf, and puts each AI thumbnail on the video's
  Thumbnail board. A run is saved once. After that, a step made again writes
  into that project, and AI music, which makes a track for a video, can only
  run once the run is saved.
- **The stepped guide** takes the middle, in the shape of Tyler's picture:
  - **Header:** an arrow back to the flow's canvas (Tyler, 14 Nov 2026: "Add
    arrow to go back to canvas"), the flow's name, the run's state in grey,
    then "0 of 4 done" and a bar of one piece a step, then the ⋮ with Open
    the video and Stop the run. Stop asks first. Runs in the Dashboards block
    goes back to the Runs table.
  - **Down the left,** on a light grey of its own ("Add light gray bg"):
    every step, numbered and joined by a line in a darker grey of its own
    that doesn't follow Settings → Styling's divider lines ("unwire the
    border to the styling settings and make the border darker"), each with its title and what it
    asks you for under it (its prompt when it asks for nothing), turning a darker grey while pointed at ("add gray hover
    effect"), with Save to a project last. A done step's number is a tick. A
    press opens the step.
  - **The step:** "Step 1/3", its Heading (or its title) in big words, its
    Short line, then a card in a grey frame, its Explanation, and Previous
    and Next.
  - **The card** shows what the step reads until the AI makes it: the
    transcript as it is typed on the right, one row a line, with its time,
    the speaker's name in blue and the words, and "4 lines · 48 words"
    beside its name. Until words are typed, it is "What it reads": each box
    by name with what it holds, shown as itself (Tyler, 14 Nov 2026: "this
    shouldnt just say filled in. actually show the video thumbnail and
    playable"). Words show their first three lines and a link shows the
    link. Files show as tiles, two to a row when there is room: a video
    plays in place, its first frame its thumbnail; a picture shows; a sound
    has a player. A video tile works as the editor's do ("it should work
    like how video editor works"): it plays the smooth 720p copy once that
    is made, the original only until then, and reads only the start of it,
    for its length and first frame, until it is played. The files are read by id from your own Media, so a reload
    shows them too. Once made, the card shows what it made as lines, or a
    button that opens the video. A step with no boxes shows what the AI is
    asked.
- **What makes a step:** each node is one step, and its boxes are on it.
- **The right panel** is the step: its icon and title, then "Step 1 of 3 ·
  Enter the details", the words saying what it wants now. Its body is the
  shell's folding cards (Tyler, 14 Nov 2026: "the run page right panel needs
  collapsible cards ui"), each folded or open as last left in this browser:
  "This step" when there is something to say (what it waits on, that it is
  being made, why it failed, what it made), then the made words while it
  waits for an OK, then one card per box named after the box, then Tip. The
  Save step's Project box is a card too.
  - **Before it is made:** its boxes (the Transcript, an upload, a Media
    pick, a link, an actor or voice), then its Tip, and its one
    button at the foot, such as "Generate script". The button sends what is
    in the boxes, and an empty or wrong box stops it, saying which by name
    ("Transcript: paste some text first."). Otherwise the boxes are kept on
    the step and the AI makes it. Once made, the boxes show what they held. An upload goes in through its own button
    in the box, through the app's upload line, so a big upload carries on in
    the corner if you move to another page.
  - **While it waits on another step** (Make the video on the script), its
    boxes can be filled in, and the button comes once that step is done.
  - **Being made:** "Being made…" on the button; the page asks again every 3
    seconds.
  - **Needs your OK:** what the AI made, its words editable. "OK" goes on,
    "Save and OK" sends the edited words to the next steps instead, and Make
    it again asks the AI once more.
  - **Failed:** the reason, and Try again. **Done:** what it made, and Make
    it again.
- **The order:** a node waits until every node with a line into it is done.
  Two nodes ready together go left to right, then top to bottom, as the
  canvas shows them.
- **Make it again and Try again** make the step again with what its boxes
  held, and send every step after it back to waiting. A step after it keeps
  its boxes, so it opens already filled in. A step after it that the
  worker is making at that moment is sent back too: what it makes from the
  old result is dropped when it finishes, never saved over the step.
- **Closing the tab never stops a run.** A background worker, `video-flow`,
  makes the queued AI steps every 15 seconds. The page asks for news every 3
  seconds while a step is being made. It stops asking once the run waits on
  you or has finished.
- **The bell rings** when a run finishes, fails, or was working and now waits
  on you. A run that waits straight after Run is pressed doesn't ring, because
  you are looking at it.
- **A run keeps its own copy of the flow**, so editing or deleting the flow
  never changes a run already going. Deleting a flow keeps its runs.

## What a node can ask you for

A node reads its own boxes first, each under its name, then what each line
into it brought.

- **Text:** the words you paste.
- **Video upload:** one video of yours. It goes on the project's Media shelf
  once the run is saved.
- **Pick from Media:** one or more files you tick, put on the project's Media
  shelf once the run is saved. On the step the card has tabs for Videos,
  Pictures and Sounds, each with how many it has (Tyler, 14 Nov 2026: "the
  files card should be seperated by tabs"), in the style Settings → Styling
  picks for dashboard tabs. Underline tabs sit in a row shaped as a panel
  header, straight under the card's heading and its full width, with the
  line on its bottom edge. A tab shows 15 files and Load more adds 15 more
  ("add a cap of 15 items and a load more button"). The files are laid out
  as the editor's Media panel ("this should show the images we already
  have in video editor", "load it in masonary style"): pictures and videos
  in two columns, each tile its own shape, a video's tile its first frame
  read from the smooth copy; sounds in an even two-column grid of small
  cards with their names. The editor's tick sits in a tile's corner and a
  ring shows it is picked. The editor's own list needs a project, which a
  run has none of until it is saved, so Flow reads the page of Media itself
  and then each file as the editor does. The search covers all
  three, and a tick stays when another tab is opened.
- **Video link:** a YouTube, TikTok or Instagram link. Only a link the
  download recognises is taken. When the step is made, the video is
  downloaded into Media and what is said in it written down, and the node
  reads both.
- **Actor or voice:** an actor of yours, a voice from the voice list, or
  both. AI picture sends the actor's main picture with the prompt. AI voice
  reads with the voice.
- **A flow from before nodes held their boxes** shows its Paste text, Upload
  and other asking nodes as nodes Flow doesn't know, marked in red, and Run
  refuses it until they are deleted and their boxes added to the node they
  fed. Steps of such a node in an older run say "From an older Flow".

## What each node does

- **AI text:** one ask of whichever AI writes words on Settings → AI
  (`writing-with-ai.md`), metered as `flow_text`.
- **AI editor** (stored as `ai-video`, its name until 14 Nov 2026): builds
  the video with the editor's own tools as its prompt says
  (`src/lib/video/flow/editor-actions.ts`). Its pictures and sounds are
  named for the AI (P1…, S1…) and its footage too (F1…). It answers with
  `actions`: make a picture move (`animate_picture`, a loop when it ends on
  its start, as Make it move does), make music (`make_music`) or a sound
  (`make_sound`, looping or not), place a file for a stretch as background,
  overlay, music, ambience or effects (looping, or blending its repeats),
  text, a timer, a starter sound, a marker, and `repeat` for rounds and sets,
  with `{n}` and `{n%K}` in its words. An answer it can't use (a file it
  doesn't have, a time back to front, an id twice) is sent back to the AI
  once with what was wrong. Its lanes are laid by role, words and timers on
  top, and none ducks, so rain never pulls the music down.
  - **Plan, OK, then make:** with Wait for my OK on, the AI editor stops
    after planning, before anything is paid for: the step shows "The plan",
    each thing it makes with its price and what it lays, and its button
    reads "OK, make it · about $…" (Tyler picked "Show plan, wait for OK").
    Make it again asks for a new plan. After OK it doesn't wait again.
  - **One paid thing a pass:** it makes each track, sound and loop on its
    own pass of the worker and writes each one down on the step as soon as it
    is paid for (`state`, drizzle/0178), so Try again carries on from where it
    stopped and never pays twice; Make it again starts from nothing. A moving
    picture is made by the AI video worker; the step looks again every 20
    seconds, saying so. The whole plan's price is checked against the
    month's allowance before the first thing is made.
  - **Cutting footage** is what AI video did: the AI is sent the prompt,
    every text in its boxes or connected to it, and what is said in each of
    its videos. The words come as timed lines, a new
  line at every pause longer than 0.7 seconds. The AI answers with stretches
  of those files, in the order they should play, and whether to add captions.
  The app cuts each stretch at the edges of the words in it, lays them end to
  end on the run's video (which goes into the project at that moment), and puts the captions on a lane above them, in the
  look from Settings → Captions. The words come from saved transcripts when
  there are some (`saved-transcripts.md`), otherwise they are written down
  first. A big upload whose smooth copy isn't made yet makes the step wait and
  look again every minute, saying why (`big-files.md`).
- **AI picture:** one picture from the prompt, the shape of the run's video;
  before there is one, the shape its prompt says (16:9, wide, landscape;
  9:16, tall, portrait; square), else the run's,
  with any connected pictures or actor as references. It lands in Media.
- **AI voice:** every connected text read aloud, in the picked voice or the
  usual voice from the Read a script with AI window. It lands in Voices and
  Media.
- **AI music:** the prompt is the mood. The track is as long as the run's
  video, saved or not yet, or a minute when nothing is laid, up to 5 minutes
  (`ai-music.md`). Before the run is saved only the month's allowance holds
  it, and its meter row carries the step.
- **AI thumbnail:** follows its prompt (`thumbnail-answer.ts`). The AI
  answers with the picture under it (a connected picture by name, or a
  moment of the run's video), an optional AI change to that picture, a shade
  at the top or bottom, and the words (font, size, colour, where) and rings
  over it, laid with the Thumbnail board's own layers, a ring a true circle.
  A preview is drawn into Media for the step. A saved run's video gets it on
  its Thumbnail board at once; otherwise saving the run puts it there, as the
  step laid it (`thumbnails.md`).

## What it costs

- **In the builder** an AI node shows "From about …". The guesses behind it
  are a 4,000-character prompt for the writer, a minute of music, and 1,000
  characters read aloud (`src/lib/video/flow/estimates.ts`).
- **On the steps page** each AI step shows its price worked out from what was
  really sent, then what the meter recorded for it. The meter rows carry the
  step's id, so a step's cost is exactly its own calls.
- **The only stops** are the month's AI allowance and, once the run has its
  video, that video's own spend limit. A run's video starts with no spend
  limit, so in practice the month's allowance is the stop. AI music's cost is its known price, because
  its meter row is kept by the music tool.

## Where it is kept

`drizzle/0173_video_flows.sql`, and `drizzle/0175_video_flow_pages.sql` for
the left page:

- `video_flows`: one row per flow, the person's own. It holds the canvas as
  the shell's automation graph, holding Flow's node kinds, and a version that
  goes up with every save.
- `video_flow_starts`: when the starter was made.
- `video_flow_runs`: a run, with its copy of the graph, the project, the video
  it added, its state, and a lease so one worker makes its steps.
- `video_flow_pages`: the person's left page, its cover, its lock, and the
  Dashboards block's hidden rows and their order.
- `video_flow_run_steps`: one row per node of a run, with its state, what you
  gave it, what it made, what the AI was sent, the estimate, the cost, the
  reason it failed, a wake time and note for a step waiting on an upload,
  and what a step making several paid things remembers between the worker's
  passes: its plan, whether it was OK'd, and each file made
  (`state`, drizzle/0178).
- `video_ai_generations.flow_step_id` (drizzle/0177): the Flow step a
  moving picture was made for, before the run has a project.

## How it is built

- **Flow's nodes on the shell's canvas:** the canvas reads a node's name, icon
  and ports from the automation node list. So Flow's kinds are declared under
  `automations.nodes` in `src/app/options.ts` with no palette entry
  (`src/lib/video/flow/node-kinds.ts`). They never show in
  `/admin/automations`, and the automation engine has no executor for them. A
  test checks the first.
- **Its own runner:** the automation engine walks one chain, can't wait for two
  nodes, can't ask a person for a file, and expects steps under five minutes.
  So Flow runs its own nodes (`src/server/video/flow/`).
- **Code:** the screens are in `src/components/video-flow/`, the rules and
  shapes in `src/lib/video/flow/`, the server functions in
  `src/lib/api/video/flow.ts`, and the route is
  `src/routes/_authenticated/admin/video-flow.tsx`.

## What has not been run

- **No AI step has finished locally.** The local Gemini key is a free key, and
  on 14 Nov 2026 it refused the first AI text step with HTTP 429. The failure,
  its bell and Try again were seen in a real browser. AI text, AI video's cut
  with captions, Wait for my OK with an edited script, Make it again and Try
  again pass in tests with a stand-in AI.
- **AI picture, AI voice, AI music, AI thumbnail, the AI editor's making
  and the Video link box** call the same tools the editor uses, but none has
  been run end to end in a flow with real keys. The AI editor's plan, OK,
  making one thing a pass, Try again never paying twice, and laying a
  2-round Pomodoro pass in tests with stand-ins for the AI and ElevenLabs.
- **A real upload through a Video upload box** was not tried in the browser.
