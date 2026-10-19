# Analysing a post

The AI runs only when Analyse is pressed, with its price above the button.
Saving a post never spends AI money.

## Tyler's rules, 19 Oct 2026

- The AI waits for the Analyse button, and the price is shown first.
  ("Analyse button, price shown")
- The AI picks a folder only. Posts folders have no fields. ("Picks the
  folder only")
- The similar-post warning is checked when Analyse is pressed, not on paste.
  ("When I press Analyse")
- A post with a video: Analyse writes down what the video says and plans from
  the post and the video together, with one price. ("Analyse covers both")
- Analyse again replaces everything, the ticks and edits included, and the
  price line warns first. ("Replace all, warn first")
- The about-you line is one for the whole app. ("One line for the whole app")

## What pressing Analyse does

- **It is allowed** once the words are saved, after an analysis, and after a
  failure. It waits while the video is still saving: "Wait for the video to
  finish saving first."
- **It checks two things first**, so a refusal shows at the button: a Gemini
  key is saved in Settings → AI, and this month's AI allowance has room.
- **Then it writes `queued` and returns.** The `note-posts` worker picks it up
  on its next tick.

## The call

One Gemini call per post (`summarisePost` in `src/server/note/posts/analysis.ts`),
through the shell's `runAiCall` as `note_post_summarise`, so the AI meter and
the monthly allowance hold. The model is `DEFAULT_AI_MODEL.gemini`, which is
Gemini 3.8 Flash.

- **What it reads:** the post, the post it quotes, the rest of the thread, the
  article when it was brought in, what was said in the video, and up to 12
  pictures. The pictures ride in the same call, so the words in a screenshot or
  a chart count.
- **The video first:** when the post has a saved video that has not been
  written down yet, the same `transcribe` call Videos uses runs first
  (`note_transcribe` on the meter, with the post's id). Those words are kept on
  the post, so Analyse again does not pay for them twice.
- **What it writes:** a summary of 3 to 8 plain sentences, an action plan of 3
  to 12 steps that each start with a verb, up to 8 tags, a folder, and a
  similar post. Everything comes out in English.
- **About you:** the line from Settings → App settings → Posts goes into the
  question as "Write the plan for someone who: <line>". An empty line leaves
  it out.
- **The folder:** the AI is given the names of the person's Posts folders and
  names one, or none. The right panel shows "Move to Newsletter?" with Move and
  No thanks. Nothing moves before Move is pressed. A name that is not one of
  the person's folders is dropped without a word.
- **The similar post:** the AI is given a line for each of the person's 200
  newest analysed posts (who, the first line of the summary, the tags) and
  names the one that says nearly the same thing, or none. The panel shows "You
  saved something like this on 3 Oct" with a button that opens it.
- **Analyse again replaces everything:** summary, plan, ticks, edits, tags,
  folder suggestion and similar post. Highlights stay, because they are on the
  post's own words.

## The price line

Worked out in the browser (`src/lib/note/posts/analyse-price.ts`) from the
shell's one price list. Gemini 3.8 Flash is $0.75 a million tokens in and
$3.75 a million out.

- **The words** at about 4 characters a token, plus about 600 tokens of
  question.
- **Each picture** at about 1,120 tokens.
- **The similar-post lines** at about 40 tokens each, for up to 200 saved
  posts.
- **The answer** at about 1,200 tokens.
- **A video not yet written down** at 32 tokens a second of sound in and 4
  tokens a second of words out, then those words read again.

**A typical post**, 4,000 characters, no pictures, nothing saved before:
600 + 1,000 = 1,600 tokens in is $0.0012, and 1,200 tokens out is $0.0045.
Together $0.0057, so the line reads "Analysing costs under 1¢ with Gemini 3.8
Flash." Four pictures add $0.0034. A post with a 78-second video, before its
words are written down, comes to about $0.008.

## Analyse many at once

- **Tick posts in the middle panel.** The bar shows how many are picked and the
  total price: "Analysing 3 posts costs about 1¢ with Gemini 3.8 Flash."
- **One press, one request**, for up to 10 posts. The key and the allowance are
  checked once. Each post is queued or skipped, and the toast says how many
  went and why the first skipped one did not.

## One plan from many

- **Tick two to ten analysed posts and press One plan.** The bar shows its
  price first, worked from the length of the picked plans.
- **A new entry in the list**, "Plan from 4 posts", is written by one call
  (`note_post_merge`) that reads the picked posts' summaries and plans and
  writes one ordered list with repeats said once. Each step names the post it
  came from ("@naval").
- **It is a plan like any other**: ticks, edits, new steps, dragging, Copy.
- **Deleting one of the posts later** leaves the merged plan as it is. The
  panel lists the posts it was made from that still exist.
- **A post with no plan yet** is refused: "Analyse this post first, so it has
  a plan to merge."

## The bell

Each notice rings the owner's bell once, as the shell's `app_activity` kind:

- "Analysed: @naval" when Analyse finishes,
- "Plan ready: Plan from 4 posts" when a merged plan is written,
- "Failed: @naval" with the reason under it,
- "The video couldn't be saved: @naval" with the reason.

Clicking one opens `/posts?open=<id>`. The link is kept in `note_notice_links`
(its `post_id` column) and handed to the bell through
`notifications.detailsFor` in `src/app/options.ts`.

## The about-you setting

Settings → App settings → Posts. One line, up to 500 characters, saving 700ms
after the last key, on leaving the box, or on Enter, with no Save button.
Settings is the admin's screen, so the admin sets it, and it is used for every
member's posts. It is kept in the `note_settings` table.
