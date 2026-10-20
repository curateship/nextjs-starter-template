# Script check

The Voice window shows how long a script will run as you type it, and its
"Check it" button reads the script against five rules before you pay for it to
be read aloud. It is a checklist, not a prediction. It never says a script will
do well. It says which rules the script breaks, and you decide what to fix.

## Where it is

Video editor → AI → Voice. Under the "What to say" box:

- **The figures:** always there, no button, and they change as you type. "186
  words. At this speed that is about 170 words a minute, so about 66 seconds
  read aloud." Then the same script at 160, 170 and 180 words a minute.
- **The price:** the line under the figures, "Checking it costs about 0.5¢ with
  GPT-5 mini." It changes with the length of the script and the writer chosen.
- **The checklist:** appears under the price once "Check it" comes back. A
  cross marks a broken rule, with the words that broke it highlighted. A tick
  marks a rule that passed.
- **An edit after a check:** the old list stays, with "The script has changed
  since this check. Check it again to be sure." above it. Changing the speed
  counts as a change, because it moves the 30-second marks.
- **Read aloud never waits for a check.** Both buttons work whether or not the
  script was checked. Pressing either one with an empty box says so in a red
  toast instead of greying the button out.

## The five rules

| Rule | What breaks it | Shown as |
| --- | --- | --- |
| Hook in one second | More than about four words before the first comma or full stop, or nothing in them worth staying for | "Takes more than a second to hook: In this video I'm going to show you..." |
| No greeting | Opening with "welcome to this video", "in this video", "hey guys", "today we're going to" and the like | "Opens with a greeting: In this video" |
| Keep them watching | A 30-second stretch of speech with no question and no promise of something still to come | "Goes 30 seconds without a question or promise: 0:30 to 1:00" |
| Banned words | Any word on the list below | "Uses a banned word: crucial" |
| Numbers as words | A figure written with digits or symbols, such as 3, 2026, 10% or $5 | "Numbers written as digits: 3, 2026" |

- **The banned words:** set on Settings → Scripts (`/admin/settings/scripts`),
  one list for the whole install. See "Changing the banned words" below.
- **Why numbers as words:** a voice reads "2026" and "10%" however it likes.
  "Twenty twenty-six" and "ten percent" come out the way they are written.
- **The 30-second stretches:** the script is cut into stretches at the chosen
  speed before it is sent, so "0:30 to 1:00" means the same thing to the
  checker and to you. A last stretch shorter than 15 seconds joins the one
  before it, because the end of a video has nothing left to promise.
- **Only words that are really there are shown.** A failing word the checker
  names but the script does not contain is dropped, and stray commas and
  quotes come off the ones that are. The pass or fail stays as the checker
  gave it.

## Changing the banned words

Settings → Scripts holds the list, in a box with one word or short phrase per
line. It saves itself 700ms after you stop typing, and at once when you leave
the box. There is no Save button, and the page header says Saving… then Saved.

- **Before anything is saved:** the list is the four starter words, delve,
  crucial, game-changer and unlock. They show in the box, so they can be
  removed like any other.
- **Once a list is saved:** the check uses exactly that list. An empty box
  bans nothing, and the rule then always passes.
- **Typing it:** commas work as well as new lines. Spaces are tidied, and a
  word typed twice in different capitals is kept once. Leaving the box tidies
  it to one word per line.
- **Limits:** up to 200 words, each up to 60 characters. A longer one marks
  the box red and says so when you leave it, and nothing is saved until it is
  fixed.
- **Who can change it:** admins, because Settings is admin-only. The check
  itself works for anyone who can open the editor.
- **Where it is stored:** the `script_banned_words` column on the single
  `video_settings` row (migration `0106_video_script_banned_words.sql`). Empty
  (NULL) means the starter words apply. The words are read fresh on every
  check, so a change counts from the next press.
- **The price shown assumes the starter list.** A long list adds a little to
  each check: 200 words of ten letters is about 500 tokens, under a tenth of a
  cent with GPT-5 mini.

## Where the rules came from

- **One second to hook:** Jenny Hoyos, in YouTube's own write-up on Shorts.
- **No "welcome to this video":** the writing prompt of the most-starred
  open-source short-video pipeline (about 129,000 stars) tells its writer to
  "get straight to the point, don't start with unnecessary things like
  'welcome to this video'".
- **160 to 180 words a minute:** the pace Shorts narration that holds people
  is read at.
- **Nobody has tested a hook scorer against real retention.** That is why the
  check names broken rules and never gives a score.

## How the length is worked out

- **The pace at 1x is 170 words a minute**, the middle of 160 to 180. The speed
  slider scales it, so 1.2x is 204 words a minute.
- **Length is words divided by pace.** 190 words at 170 a minute is 190 × 60 ÷
  170 = 67 seconds.
- **It is "about", not exact.** Each voice has its own pace, and 170 at 1x is
  not measured off the voices. The real length is whatever the voiceover comes
  back at.

## What it costs

One check is one call to whichever AI is chosen for writing (see
[writing-with-ai.md](writing-with-ai.md)). It goes on the meter as "Script
check" (`script_check`) on `/admin/ai`.

- **The price before the press** is worked out in the browser by
  `scriptCheckCostCents` in `src/lib/video/script-check.ts`: the instructions
  (about 2,400 characters) plus the script, at four characters a token, plus
  the tokens each writer answers with.
- **The other AI windows price the same way.** Captions, Hook, Another
  language and the Transcript panel put their figure on the button, worked out
  in `src/lib/video/ai-estimates.ts` and worded by the same `formatCheckCost`
  ([price-before-you-press.md](price-before-you-press.md)).
- **Measured with GPT-5 mini on 12 Oct 2026:** a 1,007-character script used
  779 tokens in and 2,628 out, which is 779 × $0.25 + 2,628 × $2 per million,
  or about $0.0055. Most of that is GPT's thinking.
- **A full 5,000-character script:** about 0.6¢ with GPT-5 mini, about 0.3¢
  with Gemini Flash (`gemini-3.8-flash`), about 4¢ with Claude Opus 5. The Gemini and Claude figures
  are estimates until a check is run with each.
- **The meter rounds each call to whole cents**, so a 0.55¢ check shows as 1¢
  on `/admin/ai`.
- **An empty script** is refused before any AI is asked, and costs nothing.

## For whoever builds on it

`checkScript` in `src/server/video/script-check.ts` takes the script and the
speed and returns all five rules. Brief to video calls the same function on
the script it writes, and shows the findings on its storyboard
(`brief-to-video.md`). The answer must name every rule, or
the check fails with "Script check came back in an unexpected shape" rather
than quietly skipping one.
