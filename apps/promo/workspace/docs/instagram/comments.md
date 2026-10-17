# Comments on your posts

What people write under an Instagram or TikTok account's own posts, read off
its phone when the app's notification says a comment arrived, and answered
only when a person presses Send. Phone farm file 06, part 37. The same on
TikTok.

Nothing here has run on a real phone yet.

## When the phone looks

Never on a timer. Tyler, 16 Oct 2026, about checking on a clock: "if it goes
straight to the DM wouldnt that be suspicious?" He picked notifications
deciding when to look.

- **The rack reads each phone's notifications once a minute,** without opening
  any app. A notification from Instagram or TikTok saying someone "commented"
  or "replied to your comment" is one alert. Likes and follows are not.
- **Only which app and "comment" go to Promo,** never the notification's
  words.
- **Promo then asks the phone to read,** once per account at a time, inside
  the account's waking hours. A comment that arrives at night is read in the
  morning.
- **The phone taps that notification,** the way a person answers the buzz,
  which opens the post's comments. It picks the app's newest notification
  that says someone commented, never a like or a follow. When that leads
  somewhere without a comment box, or there is none, it goes in through the
  app's activity instead. It reads the comments, then spends a minute or so
  in the feed.

## What shows in Promo

- **The Comments tab** in the project's Instagram or TikTok module lists every
  comment read under the project's accounts' posts, newest first: who wrote
  it, under which post (its caption's opening words), the account, Waiting for
  you, Reply on its way, Answered or Skipped. Each one is listed once, however
  often the phone reads it.
- **The bell** rings "New comment on a post by @name on Instagram", which
  opens the Comments tab.
- **Opening a comment** shows it in the right column with a suggested answer
  in the account's voice, written once when it first opens. Write again asks
  for another.

## Answering

Nothing answers by itself. Tyler, 16 Oct 2026, asked "does it auto respond to
everything with my voice?": no.

- **Send from phone** sends what is in the box, from the account the comment
  was left for. It is refused over the network's limit: 150 characters on
  TikTok, 2,200 on Instagram.
- **The phone** opens the app's activity, finds the comment by its author and
  words, presses the Reply right under those words (never the first Reply on
  the screen), types the answer with a person's rhythm, and presses Post once.
  It counts as sent when the words show on screen outside the text box more
  often than before Post, so words left unsent in the box never count.
- **Once sent,** the comment is marked Answered with what was sent.
- **A failure** puts it back as Waiting for you, says why on the row, rings
  "Did not go out: an answer to a comment on Instagram", and is never sent
  again by itself. Sending again is a person's press, after checking the app.
- **Skip** marks it Skipped without a word. Comments are public, so they are
  kept.

## Where it is

- The server: `noteAppAlerts`, `runInboxRead`, `storeInboxReading`,
  `sendInboxReply`, `runInboxReply` and `skipInbox` in
  `src/server/social/phone-apps/inbox.ts`.
- The screen: the Comments table in
  `src/components/social/phone-apps/app-tables.tsx`, and the answer in
  `inbox-answer.tsx`.
- The rack: `new_alerts` (the notifications), `action_app_inbox`,
  `comments_from_screen` and `action_app_reply` in `rack/promo_rack.py`.
- The tables: `promo_inbox` and `promo_inbox_seen`, from
  `drizzle/0120_promo_instagram_tiktok.sql`.
