# Reddit on phones

An account on a phone does its Reddit work as taps in the real Reddit app:
who is signed in, the daily health reading, and the comment. The answers come
back in the same shapes the browser gives, so every dashboard reads them the
same way. Phone farm file 05.

Nothing here has run on a real phone yet. The steps through the Reddit app
were written from how the app is known to look; the daily self-test on the
spare phone walks them first ([the self-test](../phones/self-test-and-app-updates.md)),
and a step that does not find its button stops with a picture of the screen.

## What a phone does, and what it does not

- **Who is signed in:** the rack opens the app's account menu and reads
  "u/name", the karma and the "Reddit age" off the screen. It runs after every
  job on a phone account, as the browser's quick look does, for the account
  the job ran as only: since file 06 a phone may also carry an Instagram and a
  TikTok account, and their apps are not opened after a Reddit job.
- **The health reading:** the same reading, plus the account opening its own
  profile. The stranger's look, whether a signed-out visitor can see the
  profile, still runs in the signed-out reader browser, never on another
  phone. A phone account gets the daily reading like a browser account.
- **The comment:** below.
- **Searches and thread reads stay in the reader browser** for every account
  (Tyler, 14 Oct 2026), so an account's own history never shows a search. The
  phone reads the post itself before it comments.
- **Direct messages:** since phone farm file 06, a Reddit chat that arrives on
  the phone is read off it when its notification shows, and answered from the
  Messages dashboard when a person presses Send
  ([the Messages dashboard](../messages-dashboard.md)).
- **Anything else is refused when its button is pressed,** with words such as
  "u/name's phone cannot do answering a reply yet": answering replies, posts of
  your own, and editing or deleting a sent comment. A step that reaches the
  phone's job anyway, such as the warm-up visit, is refused there in the same
  words before anything reaches the phone.

## The account's age on a phone

The app shows the age rounded, such as "2y" or "5d". The rack counts it down
(two years is 730 days back), so a rough age never makes an account look older
than it is and never lets it past a young account's limits early. A more
exact day a browser read before is kept: of the two, the earlier one stays.

## The comment

Only after a person pressed Post, tried once and never again, one comment per
post, exactly as from a browser.

1. A minute or two in the app's home feed, scrolling like a thumb and now and
   then opening a post and going back. Trouble here never stops the comment.
2. The post opens by its link in the Reddit app.
3. The rack reads who is signed in and refuses if nobody is.
4. It reads the post, for longer the longer it is.
5. It taps the comment box and types the words one key at a time, with a
   person's rhythm: uneven gaps, a stop after each sentence, now and then a
   pause to think.
6. A short pause, then Post is pressed once. A press is never repeated, even
   if it seemed to fail, because it may have gone through.
7. The comment counts as posted once the thread shows one more line by the
   account within 20 seconds, or the app says it was posted.
8. A little more feed afterwards, which can never fail the comment.

- **The link:** the Reddit app does not show a comment's address. Promo saves
  the comment as posted, then the reader browser reads the post's newest
  replies and takes the one by the account with the same words. Until it does,
  the comment is on the Comments dashboard without a link, and checking it,
  editing it or answering its replies waits for the link. If Reddit has not
  shown it yet, the reader looks again two minutes later, three looks in all.
- **It goes out from a phone only once the self-test has walked it** on the
  spare phone and passed at least once, and never while the self-test last
  found it broken. Until then Post on a phone account is refused with how to
  run the self-test.
- **Taps land a little off the middle** of each button, different every time,
  never near its edge; swipes bend and speed up and slow down
  ([behaving like a person](../accounts/behaving-like-a-person.md)).

## The Post button says which device

On the Projects dashboard, the button under the comment box names where the
comment goes from: **Post from phone · slot 4** for an account on a phone in
shelf slot 4, **Post from browser** for one on a browser profile. Picking
another account in the **Comment as** dropdown above the box changes it.

When a phone account cannot take the comment now, Post is off and its tooltip
says why, with what to do:

- the phone is offline, with why ("Not plugged in");
- it is held, or someone is using its screen window;
- it was stopped for showing the wrong address
  ([a Wi-Fi phone's address](../phones/looking-like-a-real-person.md)).

The accounts in the dropdown are listed under **Important** and **Throwaway**
([important and throwaway accounts](../accounts/important-and-throwaway.md)).

## Moving an account from a browser profile to a phone

How a throwaway that turned valuable is promoted, one way only. In the
account's settings on the Accounts dashboard, under Throwaway. An X account
moves the same way, signed in to the X app on the phone
([X accounts](../x/accounts.md#moving-to-a-phone)), and so does a LinkedIn
account, signed in to the LinkedIn app ([LinkedIn accounts](../linkedin/accounts.md#moving-to-a-phone)).

1. **Pick a phone** and press **Move to a phone**. It has to be free, ready
   (wiped and set up if an account was on it before) and not the self-test
   phone, and the account has to have been seen signed in, so the phone can
   tell it apart. The rules for an important account are asked now: its voice
   and project must not be shared with a throwaway.
2. **Sign in by hand** on the phone through its screen window on the Phones
   dashboard. The account keeps running on its browser profile meanwhile, and
   the Accounts dashboard shows "Moving to" the phone.
3. **Check sign-in** asks the phone who the Reddit app is signed in as. The
   window says what the phone last read, such as "found u/other signed in, not
   u/name".
4. **Once the phone reads the account signed in,** the move finishes at once:
   the account runs on the phone, is marked important, and its browser
   profile's browser is closed and its saved sign-in deleted (its cookies and
   every backup of them). The profile itself stays, signed in to nobody, and
   its history says "Sign-in deleted".
5. **From then on** pointing the account at any browser profile is refused.

**Cancel move** stops a move that has not finished; the account stays on its
profile. So does retiring the account, or setting where it runs by hand. While
it waits, no other account may be set on that phone, it cannot become the
self-test phone, and the account counts as important for the voice and project
rules, as well as for the rules about posts. If anything holds the move back
when the phone reads it signed in (the phone given to another account, made
the self-test phone or wiped, or a voice or project now shared with a
throwaway), the move waits and the settings window says why.

## Where it is

- The phone side of every Reddit step: `rack/promo_rack.py`
  (`action_reddit_state`, `action_reddit_health`, `action_reddit_comment`, and
  the hands: `tap_point`, `swipe_path`, `typing_plan`). The saved screens its
  tests read are in `rack/fixtures/reddit/`, written by hand.
- Which steps a phone does: `PHONE_APP_ROUTINES` in `src/lib/phones/options.ts`,
  refused in `src/server/phones/dispatch.ts`; the comment's self-test rule in
  `src/server/phones/action-checks.ts`.
- The comment's link: `src/server/social/reddit/comment-link.ts`, a
  `comment_link` job for the reader.
- The Post button's words: `postButtonWords` and `postingBlockedReason` in
  `src/lib/social/wording.ts`.
- The move: `src/server/social/move-to-phone.ts`; the profile's sign-in deleted
  by a `forget` job (`deleteProfileSignIn` in `src/server/browser/profiles.ts`).
