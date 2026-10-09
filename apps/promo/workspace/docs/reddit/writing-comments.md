# Writing the comment

The AI drafts, a person reads it, and only then does anything reach Reddit.

## Nothing posts without a press

There is no schedule, no queue of approved comments going out later, and no
automatic retry. The whole posting path is: press the button to ask for drafts,
read them, edit one if you like, press Post. A failed post stays failed and
visible rather than being tried again, because a comment that quietly posted
twice is worse than one that did not post.

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
- **The cursor moves like a hand on a mouse,** as it always has.

Measured on 6 Oct 2026 in the same browser, typing into a blank box: 900
characters took 2.5 and 2.6 minutes from opening the page to pressing, with gaps
from 60 thousandths of a second to just over a second, typically 114. The
browser gives a comment 4 minutes and the app waits 4.5, so the app hears the
browser's own answer. The helper is `docker/browser/human.py`, beside the
network routines, so the next network types the same way.

## What the AI is told

- **The post**, its title and its own words.
- **The replies already there**, up to five of them with who wrote them and
  their upvotes. This is the part that earns its place: without it a draft
  confidently repeats whatever the top reply already said.
- **The subreddit's name.**
- **Your voice**, in your words, from the voice the account uses. Voices are
  kept on the [Voices dashboard](../voices-dashboard.md) and picked in Settings.
- **What you make**, from the same voice, and only when it genuinely answers
  what was asked. Leave that box empty and no draft will ever mention a product.
- **Your rules**, the lines it must not cross, from the same voice.

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
- **A weak one can be left out.** Settings → Reddit account lists the last ten
  sent comments under "Comments the AI copies your voice from", each with a
  tick. Untick one and the next draft stops using it. The comment itself is
  kept. Each says whether it is in the next draft.
- **The voice still counts.** Before anything has been sent there are no
  examples, and the prompt is exactly what it was without them. After that the
  examples sit beside the voice's words rather than replacing them.

The list lives on the settings tab because there is no screen of sent comments
yet. When one is built, the tick belongs there.

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

It is never off without a reason beside it. The three reasons:

- **The replies have not been read.** Read them first, so the comment does not
  repeat one of them.
- **The browser is not signed in to Reddit.** Open it in Settings and sign in
  once.
- **Reddit is showing a challenge or a captcha.** Open the browser window and
  clear it by hand.
