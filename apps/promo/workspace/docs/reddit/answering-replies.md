# Answering the people who reply to you

When somebody replies to a comment the app sent, you can answer them from the
Comments tab: draft with AI, read it, press Reply. One comment becomes a
short back and forth, which is what people read and what keeps a comment near
the top of a thread instead of folded away.

## Where it is

The reply arrow on each row of the [Comments tab](sent-comments.md) opens
the comment's Replies window. Under the row's reply count, "2 to answer" says
how many replies directly under it have no answer from the app yet.

The window shows your comment, then each reply directly under it: who wrote it,
its upvotes, when, what it says, and a link to open it on Reddit. Under each
reply is one of four things:

- **Your answer**, when one landed, with when it went and a link to it.
- **"Sending your answer now"**, while the browser is typing it.
- **"Your answer is waiting for u/name's waking hours and goes tomorrow at
  8:00"**, with Cancel answer, when Reply was pressed while the account was
  asleep.
- **The box**, otherwise: two drafts if Write with AI was pressed, the words,
  a count out of 900, Write with AI and Reply. When the last attempt failed,
  the box sits under "The last answer did not send", Reddit's or the
  browser's reason, and the words that were tried.

## Where the replies come from

A comment's check (the round arrow on its row, or Read again in the window)
reads the replies directly under the comment along with its upvotes. Up to 20
are kept on the comment, in `promo_comments.incoming_replies`, with each one's
author, words, upvotes, date and Reddit address. Until a check has read them
the window says so and offers Read again, so "not read" never looks like
"nobody replied".

A deleted or removed reply is left out, because there is nobody to answer. A
reply you already answered that has since gone stays in the window, marked as
no longer under your comment, as it read when you answered it.

Measured on 12 Oct 2026 against a real r/SaaS comment with one reply: Reddit's
data for the comment carries the reply's words and its own address, and the
app read both.

## Who answers, and the rules it follows

The answer goes out from the account that sent the comment, always. It is a
comment like any other, so every rule Post follows applies:

- A warming account is refused, and so is a young account at its pace limit.
  Answers count toward the pace, and so do answers waiting to go.
- Outside the account's waking hours it waits for its morning and can be
  cancelled until then.
- A retired account, or one with no browser profile, is refused.
- A reply already answered is refused, and so is a second press while an
  answer is on its way.

[Writing the comment](writing-comments.md) and
[behaving like a person](../accounts/behaving-like-a-person.md) have those
rules.

## What the AI is told

Write with AI asks for two drafts in the voice of the account that sent the
comment, told the project's description, the subreddit's rules and the
account's example comments, exactly as a comment draft is. What changes:

- **The post**, then **my comment on it**, then **their reply**, labelled as
  what I am answering. The post's other replies are left out, because this is
  a conversation between two people.
- It is told to answer what they said, not to repeat my comment, and not to
  open by restating their reply.

The drafts are filed against the reply (`promo_drafts.reply_to_id`), so they
never show among the post's own drafts on the Projects dashboard. They are
metered under "reddit-reply" on the AI usage screen.

## What the browser does

The `reply` routine in `docker/browser/routines/reddit.py` is the same visit as
a comment: some feed before, the reply opened by its own address the way a
person opens it from their inbox, the answer typed at a person's pace, a little
feed after.

- **Its own box, never the post's.** Everything is looked for inside the reply
  being answered, found by Reddit's id for it. The Reply button is the one in
  that reply's action row. Measured on 12 Oct 2026: on a reply's page that
  selector matches exactly one button, the reply's own.
- **The proof is the parent.** It waits up to 20 seconds for a new comment by
  the account whose parent is that reply. One that appears anywhere else fails
  the job and names where it went.
- **Tried once.** Like a comment, an answer is never retried, and one whose
  browser stopped part-way is marked failed with "may already be on Reddit".

**Not yet proven on Reddit:** the box that opens after Reply is pressed, and its
send button, only appear to a signed-in account, so they have never been
measured. The routine looks for the box inside the reply and the send button
inside that box. The first real answer is the test.

## How it is stored

An answer is a row in `promo_comments`, the same table as every comment, with
`parent_id` naming the app's comment it sits under and `reply_to` holding the
reply it answers as that reply read when the answer was written. A failed
attempt is a row too, with the words that were tried and the reason.

Because an answer is a comment the account sent, it counts in the Projects
table's comments sent, toward the account's pace, and toward the account
showing as Working on the
[Accounts dashboard](accounts-dashboard.md).

Answers are not rows of their own on the Comments tab. They show under the
reply they answer, in the Replies window. For the same reason they are never
used as voice examples: there would be no switch to turn one off.

Migration `drizzle/0109_promo_reply_to_a_reply.sql` adds the columns.

## What it does not do

- Nothing is automatic. There is no watching for replies, no answering on its
  own, and no retry.
- One level only. A reply to your answer is not offered, and neither is a
  stranger's comment on a post the app never commented on.
- No private messages.

## Where the code is

- `src/server/social/replies.ts`: which replies can be answered, queueing and
  cancelling, and what the window shows.
- `src/server/social/reddit/post-reply.ts`: sending one, run by the browser
  program for a `reply` job.
- `src/server/social/drafts.ts`: `draftReplies`, and the prompt's
  `answering` block.
- `src/components/social/comments/comment-replies-dialog.tsx`: the window.
