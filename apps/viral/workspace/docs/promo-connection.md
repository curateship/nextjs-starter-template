# The Promo connection

Viral talks to the Promo app for three things. Promo reads X, LinkedIn and
Reddit for Viral. Promo keeps the posts Viral writes as drafts. Promo tells
Viral when a post made from a vault idea goes up. Tyler, 4 Nov 2026: "Ask
Promo to read them", "Promo reports back". Promo's side is
`apps/promo/workspace/docs/viral-link.md`.

## Setting it up

1. On Promo's Settings → Viral, make a key. It starts with `pvr_` and belongs
   to the Promo admin who made it.
2. On Viral's Settings → Promo connection, fill in Promo's address and paste
   the key. Both save themselves, and the key is kept scrambled.
   - **Whose key it is.** Viral also keeps who pasted the key
     (`viral_settings.promo_key_owner_id`, `drizzle/0105_viral_promo_key_owner.sql`).
     Promo's calls back act only for that person. An answer naming someone
     else's read changes nothing, and news about someone else's idea answers
     "gone".
   - **A key with no owner.** A key saved before Viral kept the owner has
     none, so Promo's calls back are refused until the key is pasted again.
3. Press Test. It tells Promo this Viral's address, the only address Promo
   will call back, and says whose Promo answered.

## Reading X, LinkedIn and Reddit

Viral never signs in anywhere. Promo runs every read with its own readers:
X and LinkedIn in a search account's browser, Reddit in its signed-out reader
browser. A read counts against the same daily views as Promo's own reads.

- **What can be read.** On X: a search, a hashtag, an account. On LinkedIn: a
  search, a hashtag, a person, a company page. On Reddit: a search, a
  subreddit (its top posts of the week). On all three, one post with its top
  10 replies, for the thread view.
- **Threads can't be read.** Promo has no Threads, so Viral can't ask for it.
- **How a read goes.** `requestPromoRead` keeps the read as waiting and asks
  Promo. Promo answers back with the posts when its job is done, and they are
  kept in `viral_social_posts` under the read's project
  (`src/server/viral/promo-reads.ts`).
- **The same post twice.** A post found again in the same project updates its
  numbers. A search never wipes replies a thread read brought.
- **Links.** A post's address is kept only when it is on the network's own
  site, because the screens draw it as a link.
- **Waiting too long.** A page that is waiting asks Promo how the read stands,
  at most every 20 seconds. A read with no answer after two hours turns failed
  the next time it is asked about, saying "Promo never answered this read. Ask
  again."
- **Promo says no.** When Promo has nothing that can read, such as no X search
  account, the read is kept as failed with Promo's own sentence, and the same
  sentence shows as the error.

## Write a post for Promo

The "Post for Promo" button sits in a vault idea's sticky footer, beside Send
to Video. It opens a window.

- **Pick the network.** X, Threads, LinkedIn or Reddit, Tyler's four picks.
  The pick can change at any time, even after Write. Another network clears
  the written words, and asks "Discard changes?" first when they were edited
  by hand. Press Write again for the new one.
- **Write.** The AI writes the post from the idea's analysis, script, caption
  and notes. X may come back as a thread of up to 8 posts. Reddit comes back
  as a title and a body.
- **The cost.** One Gemini Flash call, about 1 cent, shown before Write. It
  goes on the AI meter as `viral_promo_post` and counts against the project's
  spend limit.
- **The limits.** X takes 280 characters a post, Threads 500, LinkedIn 3,000,
  Reddit 10,000 and a 300-character title. Words that come back longer are
  refused with "Press Write again", so a post Promo would turn down never
  shows as ready.
- **Edit, then send.** The words can be changed in the window. Send to Promo
  leaves them as a draft in the Promo project picked. Nothing is posted until
  somebody presses Post in Promo.
- **Threads.** Promo has no Threads, so a Threads post has Copy and no Send.
- **Open in Promo.** After a send, the window links to the draft. The link is
  kept only when it is on the Promo address saved in Settings.
- **A failed send.** The post keeps Promo's sentence as its reason and can be
  sent again. A post already sent can't be sent twice.

## How your version did

When Promo posts something that came from a vault idea, Promo tells Viral,
and the idea turns Posted on its own (`applyPromoPosted` in
`src/server/viral/promo-posts.ts`).

- **What counts.** An X or LinkedIn post whose draft came from Write a post
  for Promo. Or any post Promo made from an Archive item that Video sent,
  when Video's draft came from Send to Video. That chain is Viral → Video →
  Promo → Viral.
- **What is kept.** Your post's link and its views, likes and comments, one
  row per post in `viral_vault_posts`.
- **Where it shows.** The vault idea's Numbers card lists "Your X views" under
  the original's numbers, one line per post, each linking to the post.
- **Fresh views.** Promo sends the views again when they move, at most once a
  day. They are the numbers Promo's own checks read on its posts.
- **Reddit.** A Reddit post isn't reported back yet, because Promo posts it
  from the New post window without a link to the draft it came from.

## The messages

Every message carries the key as `Authorization: Bearer <key>`, both ways.
Viral checks the key before it reads a message, then refuses a message
longer than its limit (20,000 characters for news about a post, 2,000,000 for
a read's answer) by what really arrived, not by what the sender's
`content-length` claims (`readCallBody` in `src/server/viral/video-link.ts`).

- **Viral → Promo `POST /api/connect/viral/hello`** `{ viralUrl }`: Test. The
  answer is `{ name, projects }`.
- **Viral → Promo `GET /api/connect/viral/projects`**: the picker's list.
- **Viral → Promo `POST /api/connect/viral/reads`**
  `{ readId, network, kind, value }`. The answer is
  `{ readId, status, posts, error }`.
- **Viral → Promo `GET /api/connect/viral/reads/<readId>`**: how a read
  stands, in the same shape.
- **Viral → Promo `POST /api/connect/viral/posts`**
  `{ sendId, projectId, network, ideaId, pieces, title }`. The answer is
  `{ draftId, draftUrl }`.
- **Promo → Viral `POST /api/connect/promo/reads`**: a read's answer.
- **Promo → Viral `POST /api/connect/promo/events`**
  `{ type: "posted", ideaId, postKey, network, url, views, likes, comments, postedAt }`.
  An idea no longer in the vault answers `{ status: "gone" }`.

## For the screens that show X, LinkedIn and Reddit posts

The project page uses these through `use-text-socials.ts` and
`text-socials.tsx` (`project-page.md`). What a project keeps reading is in
`viral_social_watches` (`projects-and-socials.md`).


The server functions are in `src/lib/api/viral/viral-promo.ts`, and the
shapes are in `src/lib/viral/promo-link.ts`.

- Reads are asked for through what a project watches (`viral-socials.ts`,
  `projects-and-socials.md`), and by the thread view's read of one post.
  `requestPromoRead` refuses the sample project, so neither path ever asks
  Promo about made-up posts.
- `refreshPromoReadFn(readId)` asks how a waiting read stands.
- `askPromoForThread(postId)` reads one found post again with its replies,
  and `loadSocialPostFn(postId)` reads it back.

## Not proven

These have been tested with Promo stubbed on Viral's side, and with Viral and
the browser stubbed on Promo's side. No read or post has gone between the two
running apps yet.
