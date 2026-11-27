# Posts of your own

Promo can send a new post to a subreddit, not only comment on other people's.
Tyler picked this on 12 Oct 2026: some subreddits welcome an "I built this"
post, often on set days, and comments cannot reach those.

## Writing one

**New post** is the right column of Reddit on the project's dashboard, always,
because a Reddit post is read on Reddit itself and there is nothing else to
open there. Tyler, 5 Nov 2026: New post writes in the right column on every
network, and the window it used to open is gone. **New post** above the Posts
list puts the cursor in its Subreddit box, and on a phone brings the column
over the list.

- **Post as** one of the project's accounts, best to post from first.
- **Subreddit.** Leaving the box shows that subreddit's rules, read once and
  kept, with Read them when they never were. They show first because
  moderators remove self-promotion posts faster than comments.
- **What it is about**, a line or two, only for **Write with AI**, which fills
  in a title and the words in the account's voice, told the project's
  description and the subreddit's rules, and told to lead with something
  useful and mention what you make once at most. One AI call, counted as
  "reddit-post". Leave it empty and it writes from the description.
- **Ideas**, beside Write with AI, lists up to six posts worth writing, from
  the questions people asked in the project's Reddit finds and their replies:
  the 30 newest finds with a question mark in the title, the words or a reply,
  help-only posts left out. Each idea is the question and a line on what the
  post would say. Picking one puts both in What it is about, fills the
  subreddit with the one the question was asked in when the box is still
  empty, and writes the post with Write with AI. Nothing is posted. One AI
  call per opening, counted as "reddit-post-ideas"; the arrows ask again
  (`src/server/social/reddit/post-ideas.ts`). Tyler picked it on 18 Nov 2026,
  part 3 of `workspace/tasks/New features/new-features-18-nov.md`.
- **Title** (Reddit stops at 300 characters).
- **What it is** (since 18 Nov 2026, part 7 of
  `workspace/tasks/New features/new-features-18-nov.md`): **Words**, with the
  words box (10,000 characters here); **A picture**, one of your own media
  library uploads picked with the shell's picture field (a JPEG, PNG, GIF or
  WebP up to 20 MB); or **A link**, a whole address starting with https://. A
  picture or link post sends no words, because Reddit gives those posts a
  title only. A picture that is not your own upload is refused with "Pick a
  picture you uploaded yourself." A guest sent from Project has Words and A
  link only, since a guest can't open the media library. A link post's link
  goes through the same check as a post's words, so a throwaway never links
  an important account's profile, post or comment. Stored in
  `promo_posts.kind`, `image_url` and `link_url`
  (`drizzle/0241_promo_post_kinds.sql`).
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

- **Landed:** **Posts**, the first list of Reddit on the project's dashboard,
  with its account, project, subreddit and when. A row opens it on Reddit.
  Until 5 Nov 2026 this list sat inside the Comments tab, and its old address
  (`?view=comments&list=posts`) opens it.
- **Did not land:** **Failed**, beside Posts (`?list=failed`), with the reason,
  and Try again, which fills New post with the words. The bell rings for it
  too, and opens this list.
- **Empty:** "No posts of your own yet. Press New post to write one." with New
  post beside it, the same words as every network.

## Upvotes, comments and answers

Tyler picked this on 18 Nov 2026 (part 6 of
`workspace/tasks/New features/new-features-18-nov.md`).

- **Read on a press only.** Check in the Posts header reads the 50 newest
  again, and Check again in a row's right-click reads one. Nothing reads them
  by itself, the same rule the Sent tab's comments follow (Tyler declined
  comments re-checked by themselves on 12 Oct 2026).
- **How it is read.** A `post_check` job in the reader browser, signed in to
  nobody, using the reader's existing thread read, so it needs no new browser
  step. The list asks again every two seconds while one is waiting.
- **What is kept:** the post's upvotes, how many comments, and up to 20
  comments directly under it with their words, upvotes and Reddit address.
  Upvotes and Comments are two columns, from a middle column 48rem wide, with a
  dash until a check has read them, never 0, and "Reading" while one is on its
  way. When Reddit only shows the drawn page, not its own data, nothing is
  written but why, because the drawn page has no scores or addresses.
- **The bell** rings once per post when a check finds a comment that was not
  there before: "New comment on your Reddit post: I built a board". A post's
  first check rings nothing, and the account's own comments never ring.
- **Comments**, the speech-bubble button on a row (or its right-click), opens
  the post's comments in a window, the Sent tab's Replies window's shape: who,
  upvotes, the words and a link, then your answer, the one on its way, or a box
  with Answer. The account's own comments are left out.
- **An answer** goes out from the account that posted, as a `post_answer` job
  in its browser, under every rule a comment follows: warm-up, a young
  account's pace (answers count), waking hours, a paused project or paused
  commenting, and important and throwaway accounts kept apart. One answer per
  comment, tried once. A failed one shows "The last answer did not send" with
  the reason and the words tried, and the box stays to try again. An answer is
  a row in `promo_post_answers`. There is no Write with AI for it yet, and no
  bell when one fails; the window says so instead.
- **A guest** sent from Project sees the comments and answers but has no Check
  and no box, since both are the owner's.
- **Results.** These numbers are what Overview's Results widget counts for
  your Reddit posts.
- **Where it is:** `src/server/social/reddit/post-numbers.ts`,
  `src/components/social/reddit/reddit-post-comments.tsx`, and
  `drizzle/0240_promo_post_numbers.sql`.

## Where it is

- New post: `src/components/social/reddit/reddit-new-post.tsx`, in the right
  column drawn by `reddit-posts-module.tsx`.
- The rules and the sending: `src/server/social/reddit/own-posts.ts`.
- The drafting: `draftOwnPost` in `src/server/social/ai-tasks.ts`.
- The browser: `reddit_submit` in `docker/browser/routines/reddit.py`, given 900
  seconds like a comment. A picture post opens the submit page's Images tab and
  puts the file in its file box, downloaded by the browser from a public https
  address only, with no redirect followed (`_picture_file`, the same guard X's
  and LinkedIn's routines keep, tested in `docker/browser/test_reddit_submit.py`);
  the post waits for the picture to show, and the file is kept until Post has
  been pressed and answered, since Reddit may still be reading it. A link post opens the Link tab and
  types the address. Both go to the browser as `reddit/submit_media`, not
  `reddit/submit`: an image built before them does not know that name and
  refuses it before opening anything, where it would otherwise have ignored
  the picture and posted the title alone as a text post. Both were written from what Reddit's submit page is
  known to hold and wait for a signed-in run, and for the `promo-browser` image
  to be rebuilt. Built from Reddit's submit page as it was known on
  12 Oct 2026 and unproven until a signed-in account has run it.
- The table: `promo_posts`, one row per attempt, added by
  `drizzle/0208_promo_new_features.sql`. The job kind is `submit`. Its
  `source` is `viral:<idea id>` when New post opened with a post the Viral app
  wrote, so the post is reported back to Viral once it lands
  (`drizzle/0232_promo_reddit_post_source.sql`, `../viral-link.md`). Its
  upvotes and comments are read only on Check (above).
