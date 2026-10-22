# Responses on Medium

A response is Medium's word for a comment. Promo finds the story, the AI drafts
the response in the account's voice, and a person presses Post. Nothing goes
out any other way. Parts 3, 4, 17 to 25 and 35 to 39 of
`workspace/tasks/Medium/01-medium-features.md`.

## The story in the right column

Opening a story shows its title, its writer and their followers, when it went
up, its claps and responses, and its words (only the opening of a
members-only one). Medium often makes a story's subtitle from its first line;
then the line is shown once.

- **Top responses.** Read the responses reads the story's five most clapped
  responses. The AI is shown them and told to add something they do not say
  (part 19).
- **What you said before.** Up to three of your own sent responses on stories
  like this one: under the same keyword first, then by the words their story's
  title shares with this one's. The same rule as Reddit's past answers (part
  16).
- **Sent on this story** lists anything your accounts already sent here.
- **The bookmark** puts the story on the picked account's public Medium list
  ([Articles](articles.md#a-public-medium-list)).

## Writing it

- **Write with AI** asks for two drafts. The AI is told the story, its top
  responses, the account's voice and lines it never crosses, three of its own
  sent responses as its voice, the project's description, Medium's rules, and
  Tyler's rule for naming the product: "Name the product only when the story is
  about a problem the product solves. Otherwise just help, and do not mention
  the product at all."
- **Help only** (part 22) drafts with nothing about the product at all, for an
  account building an ordinary history.
- **The line it answers** (part 23). Each draft names the sentence of the story
  it answers, shown above the box with an × to answer the story as a whole. A
  line not really in the story is dropped. With a line, the browser selects that
  sentence on the page and responds to it, which is how Medium shows a reply to
  one passage.
- **Shorter, Warmer, Less salesy** (part 24) rewrite the words in the box. A
  rewrite is stored as a draft.
- **Check** (part 18) asks the AI whether the words break Medium's own rules.
- **Up to 600 characters** (Tyler: "Up to 600 characters"), counted under the
  box.

### Medium's rules

The rules check and every prompt carry Medium's rules as far as they touch a
response or an article, read off "Medium Rules"
(policy.medium.com/medium-rules-30e5502c4eb4, dated 26 May 2021) on 21 Oct 2026
and put in short in `MEDIUM_RULES` (`src/server/social/medium/drafts.ts`):

- no posting mainly to drive traffic to an outside site or product;
- no repeatedly using responses or mentions as a way to promote something;
- no duplicate content, from one account or several, and no reused templates;
- promoting your own business is allowed, someone else's is not;
- affiliate links disclosed, a link to your own newsletter said to leave Medium;
- anything received for free in connection with the topic said;
- no misleading tags, links or titles.

The same page also says, under paid, automatic, bulk or non-genuine
interactions: "Registering accounts, posting content, or interacting with users
or content automatically, systematically, or programmatically". Every response
here is pressed by a person, typed at a person's pace, and paced, but a browser
does the typing. That is the risk to the accounts, and the reason for the
warm-up, the pace and the checks below.

## Post, and what holds it back

Post goes through these checks, in `src/server/social/medium/posting.ts`, each
refusal saying what to do:

- **The account** must be one of the story's project's Medium accounts, not
  retired, with a profile or phone, and seen signed in.
- **Paused:** the account, its project, or Medium on its project.
- **The warm-up:** nothing in the first 7 days after Medium says the account
  joined (Tyler: "7 days"). With no joined date read, it is refused until Check
  now reads one.
- **The young pace:** under the young days, 2 responses or articles an hour and
  6 a day, the Settings → Behaviour numbers Reddit uses (Tyler: "Same as
  Reddit"). Past the warning number any account gets an amber line that never
  refuses.
- **One account per story** (part 21): a second of your accounts is refused on
  a story one of them already responded on, or has a response on its way to,
  in any project. The refusal names the account.
- **Too similar** (part 25): the words are compared with the 400 newest
  responses, articles and Reddit comments your other accounts sent. Compared as
  runs of three words; 0.5 of the shorter piece shared is a copy. Measured with
  the sentences in `medium.test.ts`, a 38-word response with three words changed
  scores 0.75, and a different response about the same kind of tool 0. Tyler:
  "Refuse it." The refusal names the other account and quotes its opening.
- **Waking hours** never refuse: outside them the response waits for the
  account's morning, and the box says when it goes, with Cancel response.

A pressed response waits ten seconds before the browser may take it, with Undo,
the number Tyler picked for Reddit on 12 Oct 2026. Taken back, its draft is a
draft again.

The checks and the new row are written under a lock on the story and on the
account, so two presses at once, from one account or two, from two tabs or a
person and a guest, cannot both get through.

## Sending it

The browser program takes it in the account's own browser: one or two stories
read in the project's tags, the story read, the responses opened, the words
typed at a person's pace, and Respond pressed once. Before typing it looks under
the story for the same words by the same account, so a second try after a
first that stopped part-way never sends twice. When the responses will not
load for that look, nothing is typed: "could not look" is not "not there".
Words are compared with curly quotes and dashes put back to plain ones, since
Medium's editor turns "I've" into "I’ve". Afterwards it reads Medium's own data
until the response shows, so Promo is told where it landed rather than
trusting a click. It is never tried twice by itself.

Once Medium has it, nothing after can mark it failed. A phone's response, whose
address the app does not show, stays posted even when no reader is picked to
look the address up.

## The Responses tab

Every response this project's accounts sent, newest first, with its claps, the
responses under it and whether it is still up. A figure never read shows "?",
never 0 (part 35).

- **Read again once a day** by the reader, signed in to nobody, so the check is
  how a stranger sees it. Check reads them now.
- **Gone from Medium** rings the bell when one no longer shows under its story:
  hidden by the story's writer, hidden by Medium, or deleted (part 39).
- **New response to you on Medium** rings the bell once for each response
  somebody writes under yours.
- **Answering** (part 36): each response under yours has a box with Write with
  AI and Send. The answer goes out from the account that wrote yours, through
  every check above but the one-account rule, under the response being answered,
  since on Medium a response is a story of its own.
- **Edit and Delete** (part 37), in the response's header, change it on Medium
  from the account that wrote it. Delete asks first. Both go through the pause,
  the warm-up, the pace and waking hours, and an edit's new words through the
  too-similar check. A delete counts only when Medium says the response is
  gone; when Medium will not say, it fails with "look before deleting again".
  Promo keeps the record, and the words it first went out with.

### Failed

Responses that did not go out and nobody dealt with, with the reason (part 38).
**Try again** sends the same words through every check a first press goes
through; the browser looks for the first try under the story first. It works
once per failed response: a second press, or a stale tab, is refused. When the
checks refuse it, it stays on the list to try later. **Dismiss**
takes it off the list and keeps the record. A failure also rings the bell with
"Did not go out: a Medium response".

## Where the code is

`posting.ts` (the checks and the queue), `drafts.ts` (the prompts),
`similar.ts`, `responses.ts` (sending, the list, checks, answers, changes,
Try again) in `src/server/social/medium/`, and `medium-story-panel.tsx` and
`medium-responses.tsx` in `src/components/social/medium/`.
