# Freezes and ban screens

Two things a phone can hit in the middle of an action, and what happens next
without Tyler watching: an app or the whole phone freezing, and an app showing
a screen that stops the account. Parts 15 and 16 of the phone farm.

Tyler's rule holds throughout: "Nothing posts without a person pressing Post,
and a comment or post is never tried twice."

## A frozen app or phone

- **Every action has a time limit,** sent with it from Promo. The rack gives
  up on an action a minute before that limit runs out, which leaves time to
  check the phone, restart or reopen, read the screen and hand in the answer
  before Promo stops waiting.
- **A phone that no longer answers adb is restarted.** The rack sends it a
  restart and reports it as Restarting, not unplugged, for four minutes while
  it boots. The phones have no screen lock (Tyler, 14 Oct 2026), so a
  restarted phone carries on by itself once it is back.
- **Otherwise the app in front is closed and opened again,** and the action
  is reported failed with words saying so.
- **Android's own "isn't responding" box** is closed the same way when an
  action fails with it on screen.
- **A phone that keeps freezing is left for a person.** The rack restarts a
  phone at most once in half an hour; a second freeze inside that time is
  reported without a restart.
- **The rack itself never runs an action again.** The frozen action's steps
  are cancelled, so if it wakes up later it presses nothing, takes no
  pictures and does not go to the home screen under the next action.
- **Promo decides what is tried again,** through the job list's own rule: a
  reading (a health reading, a search) is put back for another go, and it
  runs on the reopened app; a comment, an answer, a post, an edit or a delete
  is failed and never sent again.
- **A phone that stops answering between actions** is caught by the minute's
  readings: three missed readings in a row while adb still lists it, and the
  rack restarts it.
- **Each restart and reopen goes in the phone's history** with its reason.
  [A phone's health](phone-health.md) has the history.

## Ban screens

- **After every app action** (anything starting `reddit/`, `instagram/`,
  `tiktok/`, `medium/`, `x/` or `linkedin/`, whether it worked or not), the rack reads the screen for that
  app's suspended, locked and "confirm it's you" screens.
- **What counts as one:** a whole line of the app's own text that is one of
  the known phrases, such as "Your account has been suspended", "We
  suspended your account", "Your account has been locked", "Confirm it's
  you" or "Your account was permanently banned", on a screen of 30 lines or
  fewer. A post titled "Account suspended after one comment?" is not one.
  Phrases that also describe other people are left out: Reddit shows "This
  account has been suspended" on any suspended user's profile, so opening one
  stops nothing. Text from other apps on the screen, such as the clock, is
  ignored.
- **On one, Promo stops the account at once,** before the action even reads
  as finished: every account of that app on the phone is marked blocked with the screen's own words as the reason, its
  waiting jobs on the phone are dropped, the job that found it is failed and
  not tried again, and the bell rings, such as "Ban screen: u/name on Pixel 8a
  in slot 4", with the words and where the picture is.
- **From then on its jobs are refused** before anything reaches the phone,
  with the reason. A later sign-in look does not clear it.
- **Letting it run again** is a person's call: sort it out on the phone
  through its screen window, then press **Let it run again** in the account's
  settings on the Accounts dashboard. That clears the block and the
  notice.
- **The Accounts dashboard** shows "Stopped by a ban screen" under the
  account's status, with the words on hover.

The known phrases are each app's published wording, and the saved screens the
tests read (`rack/fixtures/ban-screens/`) were written from it, not dumped
from a real phone: no account on the rack has hit one yet. When a real one
shows, its words arrive with the action's answer and in the bell; save that
screen's dump in place of the written one.

## Where it is

- On the rack computer, in `rack/promo_rack.py`: `run_watched` and
  `recover_frozen` for freezes, `restart_phone` and `restarting_as_such` for
  restarts, `close_not_responding` for Android's box, `BAN_SCREENS` and
  `ban_screen_in` for ban screens.
- In Promo: `stopForBanScreen` and `clearBanScreen` in
  `src/server/phones/health.ts`, called from `finishAction` in
  `src/server/phones/rack.ts`; the refusal and the no-retry rule in
  `src/server/social/runner.ts`; `promo_accounts.ban_screen_at` and
  `promo_phone_actions.recovered` from `drizzle/0116_promo_phone_health.sql`.
- The account's card: `src/components/social/accounts/account-settings-dialog.tsx`.
