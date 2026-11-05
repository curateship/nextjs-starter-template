# The link with Viral

Promo works for the Viral app in three ways. It reads X, LinkedIn and Reddit
for Viral with its own readers. It keeps the posts Viral writes as drafts. It
tells Viral when a post made from a Viral idea goes up, and how many views it
has. Viral's side is `apps/viral/workspace/docs/promo-connection.md`. The
code is in `src/server/viral-link/`, and the tables come from
`drizzle/0136_promo_viral_link.sql`.

## The key

- **Making it.** Settings → Viral makes one key per Promo admin. It starts
  with `pvr_`. Making a new one ends the old one at once, so it asks first.
- **Pasting it.** The key goes into Viral's Settings → Promo connection with
  this Promo's address. Pressing Test there tells Promo where Viral is.
- **Calling back.** Promo only ever calls the Viral address that pressed Test,
  with the same key as `Authorization: Bearer <key>`.
- **Limits.** 600 reads and posts an hour, and 6,000 "how is it going"
  questions, per key.

## Reads for Viral

- **Where they run.** A Reddit read runs in the reader browser, as
  `viral_read`. An X read runs in a search account's browser, as
  `x_viral_read`. A LinkedIn read runs in a LinkedIn search account's browser,
  as `linkedin_viral_read`. They wait in the same queue as Promo's own reads
  and spend the same daily views.
- **What each network reads.** X: a search, a hashtag, an account, or one post
  with its top 10 replies. LinkedIn: a search, a hashtag, a person, a company
  page, or one post with its top 10 comments. Reddit: a search across Reddit,
  a subreddit's top posts of the week, or one post with its top 10 replies.
- **Threads.** Promo has no Threads, so Viral can't ask for it.
- **Refused at once.** A read Promo has nothing to run, such as X with no
  search account set up, is refused with the queue's own sentence, and
  nothing is kept.
- **No pile-up.** Viral asks again while a read is still waiting, so Promo
  refuses a second copy of a read that is still waiting, and refuses any read
  past 100 waiting for one person. A stalled reader then holds a short queue,
  not a copy of every ask in front of Promo's own reads.
- **The answer.** When the job is done, Promo keeps up to 30 posts on the
  read and posts them to Viral's `/api/connect/promo/reads`.
- **A job that fails.** The read turns failed with the job's reason once the
  job has used its three tries, and Viral is told.
- **A call back that fails.** The `promo-viral` tick tries it again, up to 20
  times, one tick apart.

## Posts from Viral

Nothing Viral sends is posted. A person still presses Post in Promo.

- **X.** A post or a thread becomes a draft on the project's X Posts tab, with
  no account picked yet.
- **LinkedIn.** A post becomes a draft on the project's LinkedIn Posts tab.
- **Reddit.** Reddit posts have no drafts, so Promo keeps the title and body,
  and the project page's `?network=reddit&newPost=<id>` opens New post with
  them filled in. The subreddit and the account are picked there.
- **Where it came from.** Each X and LinkedIn draft's source is
  `viral:<idea id>`.
- **The same send twice.** It answers the draft the first one made.
- **Refusals.** Promo's own rules still apply, such as LinkedIn's 3,000
  characters, and the refusal goes back to Viral in Promo's words.

## Telling Viral about posts

Every ten minutes the `promo-viral` tick looks for posts that came from a
Viral idea (`src/server/viral-link/reports.ts`).

- **What counts.** A posted X or LinkedIn post whose source is
  `viral:<idea id>`. Also any posted X, LinkedIn, TikTok or Instagram post
  made from an Archive item that Video sent with a Viral idea's id. Video
  sends that id when its draft came from Viral's Send to Video, and the item
  keeps it as `viral_idea_id`.
- **The first report.** Says the post is up, with its link and numbers, and
  Viral turns the idea Posted.
- **Later reports.** Fresh views, sent when they moved, at most once a day.
  They are the numbers Promo's own checks read on its posts.
- **Viral down.** The reports wait for the next pass.
- **Reddit.** A Reddit post isn't reported yet, because New post doesn't
  remember the Viral draft it was opened with.

## Not proven

Tested with Viral and the browser stubbed. No read or post has gone between
the two running apps yet.
