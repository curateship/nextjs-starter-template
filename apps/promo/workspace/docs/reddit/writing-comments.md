# Writing the comment

The AI drafts, a person reads it, and only then does anything reach Reddit.

## Nothing posts without a press

There is no schedule and no automatic retry. The whole posting path is: press
the button to ask for drafts, read them, edit one if you like, press Post. A
failed post stays failed and visible rather than being tried again, because a
comment that quietly posted twice is worse than one that did not post.

One wait exists, and only because a person pressed Post. Outside the account's
waking hours the comment waits for its morning. The post says when it goes and
offers Cancel comment until then. `accounts/behaving-like-a-person.md` has the
waking hours.

**A comment job is tried once, whatever went wrong.** Every other browser job
gets three tries, and until 6 Oct 2026 a comment did too, which contradicted
this page. The app can give up waiting while the browser is still typing; the
comment then lands on Reddit, the app records a failure, and a retry would post
it a second time. So a failed comment is marked failed at once, and one whose
browser program died part-way is marked failed with "the comment may already be
on Reddit. Check the post before posting again." rather than handed back.

## Typing like a person

The browser no longer pastes a comment in a burst. It used to type 83 characters
a second at a fixed pace, starting the moment the page loaded: 900 characters in
11 seconds on a page nobody had scrolled.

- **It reads the post first,** scrolling down and back, for longer the longer the
  post is: between about 4 and 30 seconds.
- **It types with uneven gaps between keys,** drawn from a range rather than a
  list, so two comments never share a rhythm, with longer pauses after the end
  of a sentence and the occasional stop mid-sentence.
- **It waits a moment before pressing Comment.**
- **It presses like a hand.** The box and the Comment button are pressed a
  little off their middle, at a different point each time, by the mouse
  itself, and the cursor travels there along a curve.

Measured on 6 Oct 2026 in the same browser, typing into a blank box: 900
characters took 2.5 and 2.6 minutes from opening the page to pressing, with gaps
from 60 thousandths of a second to just over a second, typically 114. The
helper is `docker/browser/human.py`, beside the network routines, so the next
network types the same way.

## The visit around it

The comment is one moment in an ordinary visit. Before it, the account scrolls
its home feed for a few minutes and opens a post or two. It reaches the post
through the subreddit's newest posts where it can, and by its address where it
cannot. After it, it scrolls the feed a little more. A failure in the feed
before never stops the comment, nothing after the comment can fail it, and it
is still sent once. Each sent comment keeps the visit's record in
`promo_comments.visit`. The browser allows the whole visit 15 minutes and the
app waits 15.5, so the app hears the browser's own answer.
`accounts/behaving-like-a-person.md` has the details and the measurements.

## What the AI is told

- **The post**, its title and its own words. A link post with no words of its
  own gets the page it links to instead, labelled as somebody else's page.
  [Link posts](link-posts.md) has how that page is read and guarded.
- **The replies already there**, up to five of them with who wrote them and
  their upvotes. This is the part that earns its place: without it a draft
  confidently repeats whatever the top reply already said.
- **The subreddit's name.**
- **Your voice**, in your words, from the voice the account uses. Voices are
  kept on the [Voices dashboard](../voices-dashboard.md) and picked in Settings.
- **What you make**, from the same voice, and only when it genuinely answers
  what was asked. Leave that box empty and no draft will ever mention a product.
- **Your rules**, the lines it must not cross, from the same voice.
- **The subreddit's own rules**, as its moderators posted them, in a block of
  their own. See below.
- **Comments you really posted**, up to three, as examples of how you write.

An account with no voice is told none of the first three, and the Reddit
dashboard says "No voice picked, so drafts are plain" beside Write with AI.

### Your sent comments as examples

Describing your own writing is hard, and three real comments teach a model more
about voice than a paragraph about tone. Every comment the app has sent is
already stored, so the newest three are shown to the model under "Comments I
have really posted", labelled as voice and not as content. It is told to copy
how they sound, their length and tone and how they open, and not to repeat
their substance, because they answered other posts.

- **Only comments that landed.** A failed attempt never reached anybody.
- **Your own words first.** A comment sent with no draft behind it was typed or
  edited by you, since the answer panel stops claiming a draft the moment its
  words change. Those come before ones the AI wrote and you sent as they were,
  then the newest.
- **A weak one can be left out.** Each row of the
  [Comments screen](sent-comments.md) has a Voice example switch. Switch one
  off and the next draft stops using it. The comment itself is kept. "Next
  draft" beside the switch marks the ones the next draft will carry.
- **The voice still counts.** Before anything has been sent there are no
  examples, and the prompt is exactly what it was without them. After that the
  examples sit beside the voice's words rather than replacing them.

The switch used to be a tick on Settings → Reddit account, because there was no
screen of sent comments. It moved to the Comments screen when that was built,
and the settings card was deleted, so there is one place to change it.

### The subreddit's own rules

Plenty of subreddits ban links, or any mention of your own product, and
breaking a posted rule is how an account gets banned. So the app reads each
subreddit's rules and shows them before you write, and the AI gets them too.

- **Read once, when a post from the subreddit first turns up.** After a search
  or a watch, a `rules` job is queued for each subreddit its posts came from
  that has no reading yet, at most 25, behind the search in the same browser.
  One subreddit a job, because a read can take two minutes on a slow Reddit and
  a job still running after the queue's ten minutes is handed back to another
  driver. Not on every search, and never for a subreddit nobody has a post
  from.
- **Kept for 30 days.** Rules barely change. A subreddit Reddit refused is asked
  again a day later.
- **Read from Reddit's own `about/rules.json`**, asked from the subreddit's rules
  page so the request carries the cookie that got past Reddit's challenge,
  exactly as the search does. If that is refused, the rules drawn on the page
  are read instead.
- **Shown first in the writing area**, above the drafts and the box, folded to
  one line that opens: "r/SaaS has 7 rules, including "No self-promotion"". The
  line names the rule about promotion, links or advertising when there is one,
  because that is the rule a comment from this app is most likely to break.
  Every rule is one press away.
- **Four answers, never confused.** Not read yet, with a Read them button. The
  rules. "r/x has posted no rules of its own" when the subreddit answered with
  none. Reddit's reason, such as "Reddit says r/x is private", with Try again,
  when it would not answer. Never an empty box.
- **Handed to the AI labelled as the subreddit's**, under "THE RULES OF r/x,
  posted by its moderators. These are the subreddit's own rules, not mine", in a
  block apart from MY RULES so the two cannot be mixed up. The hard rules then
  add one line: break none of them, and where they ban self-promotion or links,
  do not mention what I make and do not link to anything. A subreddit with no
  rules read leaves the prompt exactly as it was.

Nothing judges a draft against the rules or stops the Post button. The app shows
what the subreddit says and a person decides.

The code is `src/server/social/reddit/rules.ts`, `reddit_rules` in
`docker/browser/routines/reddit.py`, and the line itself in
`src/components/social/reddit/subreddit-rules.tsx`. The readings are in
`promo_subreddit_rules`, one row per subreddit per person.

It is also told, every time, that a comment reading as an advert gets the
account banned, which is worse than a comment nobody clicks.

## What comes back

Two drafts, side by side above the box, so there is a choice without a wall of
text. Press Write with AI again for two more. Pressing a draft puts it in the
box, and editing it there breaks the link, so the record never claims the AI
wrote what actually went out.

The post's own words are drawn as Reddit wrote them, with one exception worth
knowing: a line Reddit marks as a quote with a leading `>` is drawn as a quote
rather than as a stray angle bracket, and runs of blank quoted lines collapse to
one. A post that is mostly somebody else's words quoted back — which is common —
is unreadable otherwise.

A comment is capped at 900 characters. Past that is a blog post nobody reads.

## Which AI writes it

Whichever provider has a key saved in Settings under AI provider keys, defaulting
to Claude Opus 5. Every draft goes through the same meter as everything else in
the app: it counts against the month's AI allowance, it shows up on the AI usage
screen under "reddit-comment", and a failure is recorded there too rather than
disappearing.

No key saved means the draft button says so and names the screen to fix it on.

## Why Post is sometimes off

It is never off without a reason in its tooltip. The reasons:

- **The replies have not been read.** Read them first, so the comment does not
  repeat one of them.
- **The browser is not signed in to Reddit.** Open it in Settings and sign in
  once.
- **Reddit is showing a challenge or a captcha.** Open the browser window and
  clear it by hand.
- **The account is still warming up.** The tooltip says when its first comment
  is allowed. An account whose age has never been read is off too, until Check
  now on Settings → Reddit account reads it.
- **A young account is at its pace limit.** The tooltip says when the next one
  is allowed. The server refuses the same comment with the same words.
- **A comment on this post is already waiting** for the account's morning.
  Cancel it to send a different one.

## The pace line

Beside Post, always: "3 comments in the last hour, 11 today." Past the number
in Settings → Behaviour (4 an hour) it turns amber and says "That would be the
5th comment this hour. New accounts get banned for less." That warning never
turns Post off. Failed attempts are not counted.
