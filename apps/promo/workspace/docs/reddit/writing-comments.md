# Writing the comment

The AI drafts, a person reads it, and only then does anything reach Reddit.

## Nothing posts without a press

There is no schedule and no automatic retry. The whole posting path is: press
the button to ask for drafts, read them, edit one if you like, press Post. A
failed post stays failed and visible rather than being tried again, because a
comment that quietly posted twice is worse than one that did not post.

Two waits exist, and only because a person pressed Post. Every comment waits
ten seconds before the browser may take it, so it can be undone (below).
Outside the account's waking hours the comment waits for its morning instead.
The post says when it goes and offers Cancel comment until then.
`accounts/behaving-like-a-person.md` has the waking hours.

## Ten seconds to undo

After Post is pressed, the box empties and a line says "Sending in 10
seconds" with **Undo** beside it, counting down. Undo takes the comment back
before the browser starts, puts the words back in the box, and says "Taken
back. Nothing was sent." After ten seconds the line goes and the comment goes
out. Tyler picked this on 12 Oct 2026, to catch the wrong account or a typo.

The comment job is written with a start time ten seconds ahead (`UNDO_SECONDS`
in `src/server/social/posting.ts`), and Undo is the same Cancel a waiting
comment always had (`cancelWaitingComment`). Outside waking hours the
morning wait replaces it.

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
- **Your voice**, in your words, from the voice of the account clicked on the
  Projects dashboard. Voices are kept on the
  [Voices dashboard](../voices-dashboard.md).
- **What you make**: the description of the clicked account's project, and
  only when it genuinely answers what was asked. Before an account is clicked,
  the post's own project's description. An account in no project, or an empty
  description, means no draft will ever mention a product. Until 12 Oct 2026
  this came from a box on the voice;
  [the Projects dashboard](../projects-dashboard.md) has why it moved.
- **Your rules**, the lines it must not cross, from the same voice.
- **The subreddit's own rules**, as its moderators posted them, in a block of
  their own. See below.
- **Comments you really posted**, up to three, as examples of how you write.

A post found for one account's everyday subreddits is a help-only post
([Behaving like a person](../accounts/behaving-like-a-person.md)): it is never
told what you make, and is told never to mention a product or link to
anything.

An account with no voice, or no account clicked yet, is told no voice and no
rules, and Write with AI's tooltip on the Projects dashboard says "No voice
picked for this account, so drafts are plain". The example comments below are the clicked account's own,
so before one is clicked there are none.

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
- **Four answers, never confused.** "r/x rules not read yet", with a Read them
  link at the end of the line. The
  rules. "r/x has posted no rules of its own" when the subreddit answered with
  none. Reddit's reason, such as "Reddit says r/x is private", with Try again,
  when it would not answer. Never an empty box.
- **Handed to the AI labelled as the subreddit's**, under "THE RULES OF r/x,
  posted by its moderators. These are the subreddit's own rules, not mine", in a
  block apart from MY RULES so the two cannot be mixed up. The hard rules then
  add one line: break none of them, and where they ban self-promotion or links,
  do not mention what I make and do not link to anything. A subreddit with no
  rules read leaves the prompt exactly as it was.

Nothing stops the Post button over a rule. The app shows what the subreddit
says, checks a comment against it when asked (below), and a person decides.

The code is `src/server/social/reddit/rules.ts`, `reddit_rules` in
`docker/browser/routines/reddit.py`, and the line itself in
`src/components/social/reddit/subreddit-rules.tsx`. The readings are in
`promo_subreddit_rules`, one row per subreddit per person.

It is also told, every time, that a comment reading as an advert gets the
account banned, which is worse than a comment nobody clicks.

## Checking it against the rules

**Check**, beside Write with AI, reads the words in the box against the
subreddit's posted rules and the voice's own rules, and says in one amber line
which it may break: "May break a rule: No links. Post still works." Pressing
the line shows each rule and why. With none broken it says so in grey, and
says when the subreddit's rules were never read, so only the voice's were.

- **Only on a press.** Tyler, 12 Oct 2026: "let me click the check button".
  Picking a draft or typing never costs an AI call.
- **It never turns Post off.** It warns.
- **A result belongs to the words it read.** Change the words and it goes,
  so an old answer never sits under new words.
- **One AI call,** counted as "reddit-rules-check". It is told the comment,
  the subreddit's rules, the voice's rules and the project's description, so
  it can tell when the comment promotes it.

## Rewriting the words

Under the box, once it has words in it, three small buttons rewrite them:
**Shorter**, **Plainer**, and **No product**, which takes out every mention
of what you make and any link while keeping the help. **Undo rewrite** puts
back the words from before.

A rewrite is stored as a draft (`promo_drafts.rewrite`), so the record of what
the AI wrote stays honest: a rewrite that goes out unchanged counts as the
AI's, the same as a picked draft. It is never offered as a draft tile. Each
press is one AI call, counted as "reddit-rewrite".

## What you said before

Three lines in the writing area come from the comments you already sent.

- **"You answered a post like this before"** opens up to three of your sent
  comments on posts like this one: under the same keyword first, then posts
  whose title shares at least two meaningful words. Each shows its post, its
  words and its upvotes. Only comments that landed and are still up count.
- **"This is nearly the same as your comment on ..."** turns amber when most
  of the words in the box are in one of those comments. The same words twice
  reads like a bot. It warns and never turns Post off.
- **"r/SaaS removed 2 of your 5 checked comments there."** turns amber above
  the drafts when this subreddit has removed you before, counted only from
  comments a check has read, never from ones you deleted. Post still works.
  [What happened to your comments](sent-comments.md) has the same count per
  subreddit.

The reads are `pastAnswers` and `subredditRemovals` in
`src/server/social/reddit/past-answers.ts`; the same-words test is
`nearlyTheSame` in `src/lib/social/similar.ts`.

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

Every other thing the app asks the AI goes through the same meter, each
under a name of its own: "reddit-rules-check" for Check, "reddit-rewrite" for
the rewrite buttons, "reddit-keyword-ideas" for Ideas, "reddit-post" for a post
of your own, and "reddit-comment" again when a voice is tried from its window.
They all go through one call, `askModel` in `src/server/social/drafts.ts`.

Answers to people who replied to a sent comment are drafted the same way, told
the post, the comment and the reply instead of the post's other replies, and
metered under "reddit-reply". [Answering replies](answering-replies.md) has
the rest.

No key saved means the draft button says so and names the screen to fix it on.

## Why Post is sometimes off

It is never off without a reason in its tooltip. An empty box is not one of
them: Post comment stays pressable and, pressed, says to write the comment
first. The reasons:

- **The replies have not been read.** Read them first, so the comment does not
  repeat one of them. The best few posts of every search have theirs read
  ahead, so this mostly applies to Possible and Low fit posts.
  [Finding posts](finding-posts.md) has how.
- **No account is clicked.** "Pick an account on the left." A comment always
  goes out from the account clicked on the Projects dashboard, and every reason
  below is about that account.
- **The browser is not signed in to Reddit.** Open it in Settings and sign in
  once.
- **Reddit is showing a challenge or a captcha.** Open the browser window and
  clear it by hand.
- **The account is still warming up.** The tooltip says when its first comment
  is allowed. An account whose age has never been read is off too, until Check
  now on the Reddit accounts dashboard reads it.
- **A young account is at its pace limit.** The tooltip says when the next one
  is allowed. The server refuses the same comment with the same words.
- **A comment on this post is already waiting** for the account's morning.
  Cancel it to send a different one.
- **The account, or its whole project, is paused.** Resume it on the Reddit
  accounts dashboard, or the project on its own dashboard.

## The pace line

Beside Post comment, inside the box, it says who it posts as: "as u/name",
with "3 comments in the last hour, 11 today." in its tooltip. The account's
comments today are also on its card in the left column. Past the number in
Settings → Behaviour (4 an hour) an amber line shows above the box and says "That would be the
5th comment this hour. New accounts get banned for less." That warning never
turns Post off. Failed attempts are not counted. Answers to replies count, because
they are comments too, and so do posts of your own, because they are the account
writing on Reddit too.
