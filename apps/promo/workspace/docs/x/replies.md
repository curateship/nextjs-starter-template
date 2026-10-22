# Replies on X

Answering X posts: the draft, the checks on Post, what happens after, and
answering people back (parts 21 to 28 and 37 to 40 of
`workspace/tasks/X/01-x-features.md`).

## The post and the box

Opening a post shows it with a link to it on X. Read again asks a search
account for the post's top five replies (part 22), which show under it and go
to the AI, so a draft never repeats them. Each top reply has "Reply to this
instead" (part 26): the draft then answers that reply, with the post as
background, and the reply goes under it.

Beside the box:

- **What you said before** (part 23): up to three of your replies that landed,
  under the same keyword first, then by the words they share with this post.
- **What was already sent here** by any of your accounts.
- **Reply as**: the project's X accounts, with a Paid badge, followers, and
  whether the daily look found the account hidden.

## Drafting

- **Write with AI** writes two replies in the picked account's voice, up to 280
  characters (more on a paid account, part 27).
- **Help only** (part 24) tells the AI nothing about the product. An account
  can start every Nth reply as Help only, set on the Accounts dashboard: with
  every 3rd, replies 3, 6 and 9 start with it on. It can always be switched.
- **Shorter, Warmer, Less salesy** rewrite the words in the box.
- **Check** checks the words against X's spam rules, and a
  community's rules when posting into one.
- **The AI copies your best replies** (part 25): replies you typed or edited
  yourself are shown to it first as your voice.
- **Quote** instead of Reply (part 34) writes a quote post: your words on top
  of their post, seen by your followers too. A quote stays on your page for
  good, so the AI is told to keep it from sounding salesy.

## The checks on Post

Post goes through every check below under a lock, so two presses at once send
one reply:

- **Words.** Empty is refused. Over 280 characters on a free account is
  refused, counted the way X counts (a link is 23, an emoji 2). A link of any
  kind is refused, by Tyler's answer: an address, or anything shaped like
  `name.tld` that X would turn into a link (bit.ly/x, tool.gg). "e.g." and
  "Node.js" are words, not links.
- **Warm-up.** Nothing before day 8, counted from when X says the account
  joined, or from when Promo first saw it signed in.
- **Pace.** A young account, under the young days in Settings → Behaviour,
  sends at most the replies a day and an hour under X there, 100 and 10 to
  begin with. Replies, quotes, answers and posts of its own all count, and so
  do ones waiting to go. Each post of a thread counts as one, so a thread of
  five counts five.
- **Waking hours** hold a reply until the account's morning, never refuse it.
- **One of your accounts per post.** Another of your accounts already under the
  post refuses Post.
- **Closed replies** refuse a reply and allow a quote.
- **Important and throwaway** (part 8): a throwaway never replies to or quotes
  an important account's post, and never names it as @name or links its page.
- **Too similar** (part 28): words close to what another of your accounts sent,
  on X, Medium or Reddit, give a warning naming it. Tyler, 21 Oct 2026: "Warn
  only". Post still goes, and the warning stays on the reply.

Then there are ten seconds to take it back.

## Sending

The reply goes out once, from the account's own browser or phone, as a visit:
some home feed, the post, typing at a person's pace, a little scrolling after.
It never likes, reposts or follows inside the visit.

- **Follow back** (part 44): an account with it switched on follows the person
  it replied to, as a job of its own afterwards. At most the follows a day in
  Settings → Behaviour, 5 to begin with. One over the number is dropped, not
  held for tomorrow, because too many follows is one of the surest ways to get
  locked.
- **On a phone**, the X app doesn't show where a reply landed, so a search
  account looks it up a minute later by its opening words.

## After sending

- **The Replies tab** (part 37) lists every reply, quote and answer the
  project's accounts sent, with views, likes and replies. A number not read
  yet says so and is never shown as 0.
- **Read again once a day** through a search account. A new reply under ours
  rings the bell once ("New reply to you on X from @name"). One of ours folded
  behind "Show more replies", hidden by the poster, removed by X or deleted
  rings "Gone from X:".
- **Answers** (part 38): each reply under ours opens with a drafted answer from
  the same account, sent only on a press, through the same checks, with the
  same ten seconds to take it back, or a line saying it waits for the
  account's morning. A reply already answered says so and has no box.
- **Mentions** (part 39): posts naming one of your accounts as @name, read once
  a day per account, are listed on the Replies tab and can be answered the same
  way. The bell rings once for each.
- **Edit and delete** (part 40). Any reply can be deleted, and only a pause
  refuses a delete: the warm-up and the pace are about putting things up,
  and must never trap a bad reply. Only an account marked paid can edit, and
  only within the hour X allows; an edit goes through the same checks as a
  new reply, the important-and-throwaway rule included.
- **Both wait for the account's waking hours**, like everything it does on X.
  An edit pressed while the account sleeps past the end of X's hour is
  refused at once, since it could never go out in time.
- **Failed**: a reply that didn't go out is on the Failed list with why, and
  rings "Did not go out: an X reply". Try again sends the same words through
  every check, once. The browser looks under the post first for the same words
  from the same account, however long ago, so one that landed after all is not
  sent twice. On a phone the X app looks under the post for
  our words too, but a phone's failure that says it may already be on X, or a
  phone that went quiet after it started, is never tried again from here: look under the post on X, and if it
  isn't there, Dismiss it and write it again.
- **A lock screen** that stops the account marks its waiting replies and posts
  as not sent, with the reason, so none stays "on its way".
- **Cancel on the Jobs dashboard** takes a waiting reply back the way the ten
  seconds do: the reply goes, and its draft is a draft again.
- **A phone reply's address** is looked up once a day through X's search,
  comparing words without minding capitals or line breaks.

## Where it is

- `src/server/social/x/posting.ts`: the checks and the queue.
- `src/server/social/x/replies.ts`: sending, the Replies tab, checks, mentions,
  edits, deletes, Try again.
- `src/server/social/x/drafts.ts`: every prompt, and X's rules as handed to the
  AI.
- `src/server/social/x/similar.ts` and `follows.ts`.
