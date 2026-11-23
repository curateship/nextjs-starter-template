# Your profile

Date reads your own Tinder profile, the AI suggests a better photo order, bio and prompt answers, and the phone makes a change only when you press Apply on it. The first-photo test puts each of your top 3 photos first for a week and keeps the one that brought the most matches per 100 likes. All of it is on the My profile panel, `?open=me` on the Dating dashboard (`src/components/dating/my-profile-panel.tsx`).

## Tyler's rules

From the task `../tasks/features/03-your-profile.md`, 18 Oct 2026. They outrank the code.

- **What the phone may change**: "photo order, bio and prompts. Each change shows before and after, and nothing changes until you press Apply."
- **First-photo test**: "your top 3 photos, a week each, three weeks in all. Then it shows matches per 100 likes for each, and puts the winner first."
- **Still true from 17 Oct**: "the AI never makes up facts about Tyler. No notices anywhere."
- **Not done**: adding or deleting photos, choosing different prompt questions, and anything without Apply.

## The suggestions

- **Photo order, bio and each prompt** are their own block on the panel, each with Before and After.
- **Apply** puts one walk on the phone's list (`src/server/dating/own-profile.ts`, `applySuggestion`). While it runs, the block says "Applying on the phone".
- **Every change is read back.** The walk saves on Tinder, reads the whole profile again, and fails if the profile does not show the change (`src/server/tinder/walks/account.ts`). A failed change says why in its own block, until the profile is read again, and nothing is recorded as applied.
- **What a change replaces is kept just before the phone presses Done.** So Undo is there even when a walk fails after Tinder saved.
- **After it works**, the block says "Applied 22 Oct". The AI's suggestions stay on the panel. Only Read it again clears them, because that asks the AI to look again.
- **Undo** sits on the block of the last Apply and puts back what that Apply replaced (`before` on `date_own_profile`). Once Undo has worked, Apply is offered again. After Read it again clears the suggestions, Undo sits under your profile instead.
- **One change at a time.** A second Apply or an Undo while the phone is still making the last one is refused, so two never cross over what Undo puts back. A first-photo test's move waiting on the phone does not block the bio or a prompt.
- **A bio over 500 characters is refused**, because Tinder takes 500 at most. The AI is told the same limit.
- **The photo order is the AI's order,** then any photo it left out, in the order it stands now. When the photos on Tinder are not the ones the AI looked at, the block asks for Review again.

## New prompt answers

- **The AI writes a new answer for each prompt from About me only**, the member's own words in the Dating settings (`src/server/dating/prompts/review-profile.ts`). Every fact in an answer must be in About me.
- **"Keep" is the answer** when About me is too thin, or the old answer is better. The block then shows the answer as it is and has no Apply. A prompt the AI left out, or answered in the same words, is a keep too.
- **Prompts are read from the "Prompts" section** of the edit screen, its lines in pairs: the question, then the answer (`promptsOf` in `src/server/tinder/walks/parse.ts`). This is a guess until the edit screen is read on a real phone.
- **Only the answer changes.** The question stays.

## How the phone moves a photo

- **Each photo on the edit screen is matched to Date's own copy by how it looks** (`matchPictures` in `src/server/phone/pictures.ts`), because a new screenshot is never the same bytes.
- **The first photo out of place is long-pressed and dragged** to where it belongs, and the screen is matched again, until the order is right. It works whether Tinder puts the dragged photo in front of the one it lands on or swaps the two.
- **A photo read again keeps its id.** Any read of your profile matches the photos to the ones Date already keeps. So "photo 2" means the same photo before and after the phone moves it.
- **A different number of photos stops the walk.** It asks you to read your profile again. Adding or deleting photos is not something the phone does.

## The first-photo test

- **Test my first photo** starts it. It needs at least 3 photos, and only one test runs at a time. While it runs, Apply and Undo on the photo order are refused.
- **Each week starts once Tinder shows that photo first.** The worker's pass asks the phone to put it first, reads it back, and the week's seven days start then (`photoTestStep`).
- **A week counts the likes the member or the AI gave, and the matches made,** between its start and its end. Samples never count. The week running now shows its numbers so far.
- **The card says how many likes each week had**, such as "30 matches per 100 likes (3 matches from 10 likes)". A slow week, such as a holiday, shows as few likes.
- **The winner has the most matches per 100 likes.** A tie goes to the week with more likes, then to the photo that was higher. A week with no likes cannot win.
- **At the end the winner goes first.** The rest keep the order they had before the test. With no likes in any week there is no winner, and the order from before goes back.
- **Stop the test**, after a confirm, puts the order from before the test back. The weeks so far are kept. A move still waiting is called off.
- **A move the phone cannot make** says why on the card, and the pass asks again an hour later. Quiet hours, the phone switched off and a paused profile are the usual reasons.
- **A move that fails on the phone three times ends the test** where it is, with the photos left as they are and the reason on the card. Adding or deleting a photo on Tinder during the test does this, because no move can work after it.

## Where it is kept

- `date_own_profile` gains `before` and `applied_at` (`drizzle/0109_date_profile_apply.sql`). The AI's review keeps the photos it numbered (`photoIds`) and its prompt answers (`prompts`, `drizzle/0110_date_prompt_answers.sql`).
- `date_photo_tests` has one row per week: the photo, started, ended, likes, matches, the winner, and the moves the test asked for (`drizzle/0111_date_photo_tests.sql`).

## What is not proved yet

- **No real phone has run these walks.** The edit screen, a prompt's screen, Done and the photo drag are built by hand (`src/server/tinder/fixtures/screens.ts`). The first Apply on the real phone, with Tyler watching the screen window, is the proof. `tinder/walks.md` says how to fix a label that is wrong.
- **The phone app's long press** (`holdMs` on a swipe, `android/app/src/main/java/app/date/phone/Actions.kt`) has not been compiled, like the rest of the phone app.
