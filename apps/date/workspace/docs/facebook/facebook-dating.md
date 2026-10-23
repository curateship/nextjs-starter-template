# Facebook Dating

A profile can be a Facebook Dating account, beside Tinder. The AI scores Facebook cards, likes and passes, writes openers and replies, and keeps to Facebook's own rules, from the same phone and the same dashboard. Built 22 Oct 2026 from `../../tasks/facebook/01-facebook-dating.md`.

Facebook Dating lives inside the Facebook app on Android (`com.facebook.katana`), not in an app of its own. A ban there loses Tyler's whole Facebook account, not just a dating login, which is why the pace is a third of Tinder's and why a walk that wanders into the rest of Facebook stops everything.

**Nothing here has run on a real phone yet.** Every word and label the walks look for is a guess, tested against hand-made screens (`walks.md`). Tyler's first rule was to wait until Tinder works on the real phone; on 22 Oct 2026 he chose to build it now on hand-made screens, with the real-phone checks owed.

## Tyler's decisions, 22 Oct 2026

These outrank the code. In his picks' words:

- **When to start**: wait for Tinder, then "Build now on fixtures". Facebook's walks are built and tested on hand-made screens; the real-phone checks wait for the phone.
- **Daily swipes**: "50 a day". At most 50 swipes a day and 20 an hour, 8 to 20 seconds apart. The quiet hours are the same as Tinder's.
- **Comments on likes**: "High scores only". A like carries a comment the AI wrote only when the card scores 10 or more points over the like line.
- **Off Dating**: "Stop until Resume". A walk that lands anywhere in Facebook outside Dating, like the feed or Messenger, stops everything for the profile, with a picture of where it landed.
- **Likes you**: "Like back over the line". Each one is scored first, and liked back when the score clears the like line.
- **Mutual friends**: "Pass at 3 or more". 3 or more mutual friends counts like People I know. 1 or 2 show on the card and go into the opener.
- **Calls**: "Flag, no draft".
- **Second Look**: "You decide". Cards passed within 5 points of the line show in a list; nothing is liked until Tyler presses Like.
- **Same person on two apps**: "Mark and follow". Passed there means pass here. Matched or chatted there means Tyler decides.
- **Pause**: "Yes, both ways". Pause turns Facebook Dating's own break on and Resume turns it off, each read back on the phone.
- **Report**: "Report and unmatch", after a confirm, on a chat flagged as a scam.
- **Weekly surprise match**: "Automate switch". Its opener follows the automate switch like every opener.
- **Left out**: his own Facebook Dating profile (Date reads and changes nothing there), Facebook's fixed details against his dealbreakers, Secret Crush, sharing a date with a friend, Seen but no answer, and groups and events.

## What it does

- **A profile of its own.** New profile offers Facebook Dating (`../profiles.md`). It starts at Facebook's pace and can share the Tinder phone with **Use this phone**; each profile runs in its own swiping hours.
- **The cards.** Facebook opens on its feed, so every walk goes through Facebook's menu to Dating first. A suggested profile is one long page; the walk reads it to its end, keeping every photo once and up to six Instagram pictures, with the mutual friends and shared groups, then scrolls back to its top. Like and Pass check it is still the same person first: the name, the age and one of its photos.
- **Likes you first.** The loop reads the people who already liked the member, with what they wrote, before the suggested profiles, and likes back the ones over the line. A like back is a match. Their comment is what the first message answers.
- **A like with a comment.** For a card 10 or more over the line, the AI writes a short comment on one answer or photo, and the phone taps the heart beside that answer, types it and sends the like. If Facebook takes the like without asking for a comment, the comment is forgotten, not shown as sent.
- **The weekly surprise match.** When Facebook shows it, the walk reads the person from that screen, keeps them as a match so the AI writes the opener, and shuts the screen by "Not now". Nothing on it is pressed that would send anything.
- **Second Look.** On the dashboard; Like has the phone open Facebook's Second Look and like them there.
- **Chats** are read, sent and unmatched the same way as on Tinder, through Facebook's Matches tab. A chat that says they are no longer available marks them unmatched at once. A photo or voice note shows as one.
- **Report** on a scam chat reports them to Facebook as a scam, then unmatches, once Facebook confirms the report.
- **Who is signed in** reads the name in Facebook's menu and stops the profile when the phone is signed in to someone else's Facebook.
- **The break.** Pause and Resume switch Dating's break on and off in Dating's settings, and read the switch back.
- **Distance and ages** are set in Dating's settings from the profile's, like Tinder's.
- **Stop screens.** Facebook asking to confirm it's you, the account restricted, disabled or under review, a Dating profile that is not available, an update Facebook insists on, signed out, out of likes, Facebook not installed, a step that left Dating, and buttons missing after an update. Each stops the Facebook profile until Resume; the Tinder profile on the same phone carries on.
- **A frozen Facebook** is closed and opened again once before a walk gives up, never after something was typed.
- **After an update** a read-only check finds every button before the profile swipes again.
- **Compare apps** in the left panel puts the profiles side by side, and suggests moving swiping hours when one does clearly better.
- **Sample data** on a Facebook profile shows each of these (`../dating-dashboard.md`).

## Where it lives

- `src/server/facebook/screen-words.ts`: every word and label, the Dating mark, the way from Facebook's feed to Dating, and `FACEBOOK_SCREENS`.
- `src/server/facebook/stop-screens.ts`: Facebook's stop screens.
- `src/server/facebook/walks/`: the card walks (`card.ts`), Dating's settings (`settings.ts`), and the list of Facebook's walks with the report and the check (`index.ts`).
- `src/server/facebook/fixtures/fake-facebook.ts`: the pretend Facebook the tests run against.
- Shared with Tinder: the walk kit and job list (`../tinder/walks.md`), the loop (`src/server/dating/worker.ts`), the AI (`../ai/how-the-ai-decides.md`), and the comparison (`src/server/dating/compare.ts`).
- The database: `drizzle/0112` to `drizzle/0123`, each adding columns only.
- Tests: `src/server/facebook/walks.test.ts` (every walk) and `src/server/facebook/loop.test.ts` (the loop, the AI, Pause, the comparison and the samples).
