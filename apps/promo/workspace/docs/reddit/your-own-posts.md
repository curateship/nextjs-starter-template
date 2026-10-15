# Posts of your own

Promo can send a new post to a subreddit, not only comment on other people's.
Tyler picked this on 12 Oct 2026: some subreddits welcome an "I built this"
post, often on set days, and comments cannot reach those.

## Writing one

**Create post**, at the top of a project's posts column, opens New post.

- **Posts as** one of the project's accounts, best to post from first.
- **Subreddit.** Leaving the box shows that subreddit's rules, read once and
  kept, with Read them when they never were. They show first because
  moderators remove self-promotion posts faster than comments.
- **What it is about**, a line or two, only for **Write with AI**, which fills
  in a title and the words in the account's voice, told the project's
  description and the subreddit's rules, and told to lead with something
  useful and mention what you make once at most. One AI call, counted as
  "reddit-post". Leave it empty and it writes from the description.
- **Title** (Reddit stops at 300 characters) and **the words** (10,000 here).
- **Post to Reddit** is greyed out, with why in its tooltip, only when the
  project has no accounts or for a reason Post is off on a comment, such as a
  paused or warming-up account. An empty subreddit or title never greys it
  out: pressing Post then says what is missing in the error toast and marks
  the empty box in red.

## What happens after Post

Every rule a comment has: the account must be the person's, in this project,
not retired or paused, past its warm-up and inside its pace, and outside its
waking hours the post waits for its morning. A post counts against the pace
like a comment. One post at a time is on its way; a second waits for the
first to land. A blocked subreddit is refused.

The browser program then visits like a person: some feed, the subreddit's own
page, its submit page, the title and words typed at a person's pace, Post, a
little feed after. The proof it landed is the page moving to the new post's
address. It is tried once and never again, because a second go could post
twice.

## Where it shows

- **Landed:** the Comments tab's **Posts** tab, with its account, project,
  subreddit and when. A row opens it on Reddit.
- **Did not land:** the Comments tab's **Failed** tab, with the reason, and
  Try again, which opens New post on its project with the words filled in. The
  bell rings for it too.

## Where it is

- The window: `src/components/social/projects/new-post-dialog.tsx`.
- The rules and the sending: `src/server/social/reddit/own-posts.ts`.
- The drafting: `draftOwnPost` in `src/server/social/ai-tasks.ts`.
- The browser: `reddit_submit` in `docker/browser/routines/reddit.py`, given 900
  seconds like a comment. Built from Reddit's submit page as it was known on
  12 Oct 2026 and unproven until a signed-in account has run it.
- The table: `promo_posts`, one row per attempt, added by
  `drizzle/0110_promo_new_features.sql`. The job kind is `submit`.
