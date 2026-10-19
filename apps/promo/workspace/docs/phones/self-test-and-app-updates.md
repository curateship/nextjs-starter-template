# The daily self-test and app updates

A broken action is found by a test, not by a failed comment, and an app update
never breaks the whole rack in one night. Parts 20 and 21 of the phone farm,
behind **Self-test** on the Phones dashboard.

## The test phones, one per kind

Tyler's choice, 14 Oct 2026: a spare phone signed into a test account used
only for the self-test, never a real account's phone, so a rehearsal never
adds odd activity to an account that matters. Since 18 Oct 2026 there is one
per kind of phone: a spare Android and a spare iPhone
([iPhones on the rack](iphones.md)).

- **Picked in Settings → Phones,** under Self-test phones: one slot lists
  only Androids, the other only iPhones. A pick saves the moment it changes,
  and a phone of the other kind is refused for a slot.
- **A phone that runs an account is refused** as a test phone, and both test
  phones are left off every "Runs on" list, so no real account lands on them.
- **Promo runs no jobs for the test account.** It is signed in by hand through
  the phone's screen window.
- **Everything below happens per kind.** The iPhone test phone's answers
  refuse iPhone jobs only, its app updates go round the iPhones only, and its
  daily run waits for its own phone without holding up the Android's.

## The self-test

- **Once a day,** the rack walks every action it knows on the test phone up to
  just before its last button (Post, Send, Share) and stops there. It finds
  that button and never presses it: the rack's step walker refuses to press
  the last button in a rehearsal, whatever the action asks, and a rehearsal
  that tries to tap Post, Send or Share as an ordinary step is stopped before
  the press.
- **It waits** while the rack is paused, the test phone is held or offline, or
  the rack is not checking in, and goes on a later tick.
- **A step that cannot find its button** marks that action broken for that
  kind of phone. The bell rings, such as "Self-test failed: Post a Reddit
  comment", or "Self-test failed on iPhone: Post a Reddit comment", with the
  step it stopped at, and the picture of where it stopped is on the test
  phone's Actions tab.
- **Jobs that need a broken action are refused** before anything reaches a
  phone, with the day and the step: "The daily self-test found reddit/comment
  broken on 2026-10-14, at "Open the reply box". Promo refuses it until the
  self-test passes again." A refusal is final, so the job is not tried again.
- **It passes again** the next time the self-test walks it through, and the
  notice goes.
- **Run it now** in the Self-test window, one button per kind, asks for it
  straight away, with the day's store look, and counts as that day's run.
- **What it walks:** reading the system version off Settings; in the Reddit
  app who is signed in, the health reading, the comment, and reading and
  answering a chat (phone farm files 05 and 06); and in the Instagram and
  TikTok apps who is signed in, the daily reading, the profile, a post, and
  reading and answering a message. About twenty rehearsals, so it has half an
  hour. The wipe is never rehearsed. The test phone needs the test account
  signed in to all three apps, or their steps read as broken.
- **The comment rehearsal** opens a post found in the last week, taps the
  comment box, types nothing, finds Post without pressing it, and backs out.
  With no post found lately it opens the first post in the test account's feed.
- **The post rehearsal** puts a plain picture the rack makes in the test
  phone's gallery, hands it to the app's share screen, presses Next to the
  caption box, types nothing, finds Share or Post without pressing it,
  discards the draft and deletes the picture.
- **The profile rehearsal** opens Edit profile and the bio's screen, finds its
  box and its Save, types nothing and backs out without pressing Save.
- **The answer rehearsal** opens the inbox and its first conversation, if the
  test account has one, and finds the box and Send without pressing it. An
  empty inbox passes at the inbox.
- **The comment, the post and the profile change only go out from a phone once
  the self-test has passed them** at least once. Before that, Post or Apply on
  a phone account is refused with how to run the self-test. An answer to a
  message or a comment is refused only when the self-test last found it
  broken, since the test account may have nothing in its inbox to rehearse on.

## App updates, one phone first

- **Promo knows each phone's versions** of Reddit, Instagram and TikTok, read
  every ten minutes. Each row on the Phones dashboard lists them, the Health
  tab shows them, and the Self-test window has every phone's.
- **Once a day the rack looks in the store** on each test phone (Tyler's
  choice, 14 Oct 2026): the Play Store on the Android, the App Store on the
  iPhone, and reads whether each app's page shows Update. It presses nothing.
  A newer version rings the bell: "App update out: Reddit", or "App update
  out: Reddit on iPhone".
- **Update on the test phone** opens the app's store page there, presses
  Update and waits up to eight minutes for the new version. The self-test then
  runs on it by itself. If the rack cannot say which version it updated to,
  the round fails, because the other phones could not be told apart.
- **Passed:** the window says so, and **Update the other phones** (or **Update
  the other iPhones**) updates every other phone of that kind that has the app
  and is not on the new version, one action per phone. A phone offline or
  held is skipped and named. An iPhone round never touches an Android.
- **Failed** (the update or the self-test): the window says why, and the rest
  of the rack stays where it is. Update on the test phone tries again.
- **Update the other phones stays pressable** before then, and says the test
  phone has to pass first.
- **Automatic updates must be off** in the Play Store on every Android and in
  the App Store (Settings, App Store, App Updates) on every iPhone, or a new
  version arrives without this. Each phone's setup check reads the setting
  ([making each phone look like one person's](looking-like-a-real-person.md)).

## Where it is

- In Promo: `src/server/phones/self-test.ts` (the test phones, the daily ask,
  the answers, the update rounds), `src/server/phones/action-checks.ts` (the
  refusal), and the tables `promo_phone_action_checks`, `promo_app_rollouts`
  and the test phone on `promo_phone_settings`, from
  `drizzle/0116_promo_phone_health.sql`; the iPhone slot and the per-kind
  keys on both tables from `drizzle/0121_promo_iphones.sql`.
- The window: `src/components/phones/self-test-dialog.tsx`; the pick:
  `src/components/phones/phone-settings.tsx`.
- On the rack computer, in `rack/promo_rack.py`: `Walk.final` (found, never
  pressed, in a rehearsal), `REHEARSALS` and `action_self_test`,
  `action_check_updates` and `action_update_app`.
