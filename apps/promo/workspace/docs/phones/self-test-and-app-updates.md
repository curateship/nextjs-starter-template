# The daily self-test and app updates

A broken action is found by a test, not by a failed comment, and an app update
never breaks the whole rack in one night. Parts 20 and 21 of the phone farm,
behind **Self-test** on the Phones dashboard.

## The test phone

Tyler's choice, 14 Oct 2026: a spare phone signed into a test account used
only for the self-test, never a real account's phone, so a rehearsal never
adds odd activity to an account that matters.

- **Picked in Settings → Phones,** under Self-test phone. It saves the moment
  it changes.
- **A phone that runs an account is refused** as the test phone, and the test
  phone is left off every "Runs on" list, so no real account lands on it.
- **Promo runs no jobs for the test account.** It is signed in by hand through
  the phone's screen window.

## The self-test

- **Once a day,** the rack walks every action it knows on the test phone up to
  just before its last button (Post, Send, Share) and stops there. It finds
  that button and never presses it: the rack's step walker refuses to press
  the last button in a rehearsal, whatever the action asks, and a rehearsal
  that tries to tap Post, Send or Share as an ordinary step is stopped before
  the press.
- **It waits** while the rack is paused, the test phone is held or offline, or
  the rack is not checking in, and goes on a later tick.
- **A step that cannot find its button** marks that action broken. The bell
  rings, such as "Self-test failed: reddit/comment", with the step it stopped
  at, and the picture of where it stopped is on the test phone's Actions tab.
- **Jobs that need a broken action are refused** before anything reaches a
  phone, with the day and the step: "The daily self-test found reddit/comment
  broken on 2026-10-14, at "Open the reply box". Promo refuses it until the
  self-test passes again." A refusal is final, so the job is not tried again.
- **It passes again** the next time the self-test walks it through, and the
  notice goes.
- **Run it now** in the Self-test window asks for it straight away, with the
  day's Play Store look, and counts as that day's run.
- **What it walks today** is reading the Android version off Settings, the
  only action that walks a screen so far. Each Reddit, Instagram and TikTok
  action joins it as it is written (phone farm files 05 and 06), and the
  Reddit comment only goes live once the self-test covers it.

## App updates, one phone first

- **Promo knows each phone's versions** of Reddit, Instagram and TikTok, read
  every ten minutes. Each row on the Phones dashboard lists them, the Health
  tab shows them, and the Self-test window has every phone's.
- **Once a day the rack looks in the Play Store** on the test phone (Tyler's
  choice, 14 Oct 2026) and reads whether each app's page shows Update. It
  presses nothing. A newer version rings the bell: "App update out: Reddit".
- **Update on the test phone** opens the app's Play Store page there, presses
  Update and waits up to eight minutes for the new version. The self-test then
  runs on it by itself. If the rack cannot say which version it updated to,
  the round fails, because the other phones could not be told apart.
- **Passed:** the window says so, and **Update the other phones** updates
  every other phone that has the app and is not on the new version, one
  action per phone. A phone offline or held is skipped and named.
- **Failed** (the update or the self-test): the window says why, and the rest
  of the rack stays where it is. Update on the test phone tries again.
- **Update the other phones stays pressable** before then, and says the test
  phone has to pass first.
- **Automatic updates must be off** in the Play Store on every phone, or a new
  version arrives without this. Switching them off and checking it is part 23
  (phone farm file 04).

## Where it is

- In Promo: `src/server/phones/self-test.ts` (the test phone, the daily ask,
  the answers, the update rounds), `src/server/phones/action-checks.ts` (the
  refusal), and the tables `promo_phone_action_checks`, `promo_app_rollouts`
  and the test phone on `promo_phone_settings`, from
  `drizzle/0116_promo_phone_health.sql`.
- The window: `src/components/phones/self-test-dialog.tsx`; the pick:
  `src/components/phones/phone-settings.tsx`.
- On the rack computer, in `rack/promo_rack.py`: `Walk.final` (found, never
  pressed, in a rehearsal), `REHEARSALS` and `action_self_test`,
  `action_check_updates` and `action_update_app`.
