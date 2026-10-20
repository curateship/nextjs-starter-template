# Analysing a note

The Analyse button on an imported note's Video or Post card has the AI write a
Summary, an Action plan with tick boxes, and the best Quotes, as cards of their
own under the card. The note's own text is never touched.

## Tyler's rules

- The AI runs only when Analyse is pressed, with its price shown first.
  Importing never spends AI money. ("Only on the button", 20 Oct 2026)
- The Summary, Action plan and Quotes are cards on the right; the note text
  stays his. ("Cards on the right", 20 Oct 2026)
- Analyse again replaces all of it, ticked and edited steps included, and the
  price line warns before the press. ("Replace all, warn first", 19 Oct 2026)
- Analyse many and One plan from many stay. (20 Oct 2026)
- One line in Settings → App settings says who the plans are written for. ("One
  line for the whole app", 19 Oct 2026)

## Defaults Tyler was offered and did not change

- The about-you line now feeds the plan of every import, not only X posts.
- One plan from many makes a new plain note in Loose notes, "Plan from 3
  notes", holding the merged plan and links to the notes it came from.

## The price line

Beside the button, as in Tyler's picture: "Under 1¢ with Gemini 3.8 Flash".
`src/lib/note/library/analyse-price.ts` works it out in the browser from the
shell's one price list, never a number typed here.

- The sound is heard at about 32 tokens a second and written down at about 4.
- Then one call reads those words, the post's own words at about 4 characters a
  token, each picture at about 1,120 tokens, and writes about 1,200 tokens back.
- **Worked through for a 30-minute video** at $0.75 in and $3.75 out per million
  tokens: in 65,400 tokens is $0.049, out 8,400 is $0.032, together about 8¢.
  A 19-second short is under 1¢.
- After an analysis the line adds "Replaces the summary, the plan with your
  ticks, and the quotes."

## What the AI is asked

- **A video** (`src/server/note/analysis.ts`): one call listens to the sound only
  and writes every word down with its time, once; Analyse again reuses those
  words, which is what its price line counts. A second reads that transcript and
  writes 3 to 8 summary bullets, 3 to 12 plan steps, up to 6 quotes with their
  times, and up to 8 tags, in English.
- **An X post** (`src/server/note/library/post-analysis.ts`): its video, if it
  has one, is written down first, once. Then one call reads the post, the
  quoted post, the thread, what was said in the video and up to 12 pictures,
  and writes the same four lists. Its quotes have no times.
- **One plan from many**: one call reads the picked notes' summaries and plans
  and writes one plan of 3 to 20 steps with repeats dropped, each naming the
  note it came from.
- Each call is a row on the shell's AI meter, so the monthly allowance holds.

## The cards

`src/components/note-library/import-cards.tsx`.

- **Summary**: the bullets.
- **Action plan**: a tick box per step, the words editable in place, steps
  added, deleted and dragged, and Copy as text or Markdown. Each change saves
  at once, one save at a time. While an analysis runs the plan cannot change,
  since it is about to be replaced.
- **Quotes**: a video's quotes jump the player to the moment they were said.
- **Tags the AI suggests join the note's own** and are never taken off.
- Before an analysis each card says "Not analysed yet. Analyse writes this." A
  video where nobody speaks says so.

## Refusals

- Before the import is saved: "Wait for the import to finish first."
- An X post whose video is still downloading: "Wait for the video to finish
  saving first."
- A saved file deleted from the media library since: "The saved file has gone.
  Remove the video and import the link again."
- No Gemini key: "Save a Gemini key in Settings → AI first". A used-up
  allowance says so in the shell's words.
- A failed analysis says why on the card, and Try again queues it again. A
  failed One plan from many has Try again on its Action plan card.
- Pressing Analyse twice, or Analyse and Analyse many together, is one job: a
  note already being analysed is never put back in the queue.

## The bell

"Ready to analyse", "Analysed", "Plan ready" and the failures each ring the
bell once, through the shell's `app_activity` notices, and clicking one opens
the note in its library (`src/server/note/notices.ts`).
