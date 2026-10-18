# The Messages dashboard

Every phone account's direct messages on Reddit, Instagram and TikTok, in one
list at `/admin/messages`, under Projects in the left menu after Accounts.
Each conversation is read off the phone after the app's notification said a
message arrived, and answered only when a person presses Send. Phone farm
file 06, part 38.

Nothing here has run on a real phone yet.

## When the phone looks

Tyler, 16 Oct 2026: "if it goes straight to the DM wouldnt that be
suspicious?" So the phones do not check the inbox on a clock.

- **The rack reads each phone's notifications once a minute,** without opening
  any app. A Reddit chat, an Instagram direct message or a TikTok message is
  one alert. Reddit's replies to comments are not, since the reader browser
  reads those ([answering replies](reddit/answering-replies.md)).
- **Only which app and "message" go to Promo,** never the notification's
  words.
- **The account's phone then taps that notification,** which opens the
  conversation, reads its newest lines, and spends a minute or so in the feed.
  Inside the account's waking hours only. It taps the app's newest
  notification that is no comment, like or follow. When that does not open a
  conversation with a message box, it goes in through the inbox instead.
- **The daily health reading glances at the inbox** in case a notification was
  missed, and asks for a read if something is unread.
- **An iPhone is the exception, on a clock:** it hands the rack no
  notifications, so in waking hours Promo queues a read of each iPhone
  account's inbox once an hour (Tyler, 18 Oct 2026), one for messages and one
  for comments, recorded as the inbox being opened rather than a notification
  being tapped, and the list here fills the same way. At night nothing is opened
  ([iPhones on the rack](phones/iphones.md)).

## The list

- One row per conversation: who it is with and the network, the newest line,
  which account it was written to, Waiting for you or Reply on its way, and
  when the newest line arrived. Newest first.
- **Platform** filters to one network (`?platform=`), and the search box looks
  through names and words.
- **The bell** rings "New message for @name on Instagram" when a conversation
  first opens.
- A conversation already listed takes its new lines, and opens again if it
  was waiting on nothing. The same lines read twice are listed once.

## Answering

Nothing answers by itself. Tyler, 16 Oct 2026, asked "does it auto respond to
everything with my voice?": no.

- **Opening a row** opens the conversation in a window (`?open=<id>`), the
  account's own lines on the right. A suggested answer in the account's voice
  is written into the box the first time it opens. Write again asks for
  another.
- **Send from phone** sends what is in the box, at most 1,000 characters. A
  second press while it is on its way is refused, so it never goes twice.
- **The phone** opens the app's inbox and finds the conversation by its whole
  name, so "sam" never opens "samantha_x". Two conversations with the same
  name are refused, and nothing is sent. It types the answer with a person's
  rhythm, presses Send once, and counts it as sent when the words show
  outside the text box more often than before Send.
- **A failure** puts it back as Waiting for you with why, rings "Did not go
  out: an answer to a message on Instagram", and is never sent again by
  itself. The notice says only where to look, since the reason can name who
  wrote and a notice outlives the conversation.
- **A new line that comes in after Send** shows on the row while the answer is
  on its way. Once the answer is sent, the conversation stays open with that
  line instead of being deleted, so nothing is deleted unread.
- **Skip** puts a conversation away without a word. One whose answer's job
  failed or was dropped can be skipped too.

## Kept only while it is open

A conversation is kept only as long as it is open in Promo. Once it is
answered or skipped, Promo deletes it, words and all. All that stays is a
hash of each line read, which holds no words, so the same lines are not
listed again the next time the phone reads them. A new line from the same
person opens a new row with the conversation's newest lines.

The words pass through two other places, and neither keeps them:

- **The phone's action history.** A read of an inbox and an answer forget
  what they were given and what they found as soon as Promo has the answer
  (`PRIVATE_ROUTINE` in `src/server/phones/dispatch.ts`). A finished one's
  step pictures, which show the conversation, are deleted then too. A failed
  one keeps its pictures, so the step that went wrong can be seen, until a
  person clears them in the phone's window.
- **The answer's job.** It forgets the words once it has run, sent or not.

## Where it is

- The route: `src/routes/_authenticated/admin/messages.tsx`, and the dashboard
  `src/components/social/phone-apps/messages-dashboard.tsx` with its answer
  window `inbox-answer.tsx`.
- The server: `src/server/social/phone-apps/inbox.ts`; the endpoints in
  `src/lib/api/social/phone-apps.ts`.
- The rack: `new_alerts`, `action_app_inbox`, `conversation_from_screen` and
  `action_app_reply` in `rack/promo_rack.py`; Reddit's chats are its
  `reddit/inbox` and `reddit/reply_message`.
- The tables: `promo_inbox` and `promo_inbox_seen`, and the left menu link,
  from `drizzle/0120_promo_instagram_tiktok.sql`.
