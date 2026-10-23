# Comments on LinkedIn

A post opened from To look at shows its words, its writer and their job
title, and its top comments. Read again fetches fresh numbers and the top
comments through a search account.

## Writing the comment

- **Comment as** picks the account. A company page an account runs is listed
  under it as "as Page name" on a browser account only, which an important
  account never is, so pages wait on Tyler's call (see [Posts of your own](posts.md#as-a-company-page)).
- **Draft** asks the AI for two comments in the account's voice. It is told
  the post, the top comments so it adds something new, the voice's words,
  the account's best-liked comments as examples, LinkedIn's own rules, never
  a link, and Tyler's rule for the product: "Name the product only when the
  post is about a problem the product solves. Otherwise just help, and do not
  mention the product at all."
- **Help only** leaves the product out of the prompt altogether.
- **Answer this instead** on a top comment writes a reply under that comment,
  where more people read on a busy post.
- **Shorter, Warmer, Less salesy** rewrite the words in the box.
- **Check rules** asks the AI whether the words break LinkedIn's
  Professional Community Policies as Promo has them written down
  (`LINKEDIN_RULES` in `src/server/social/linkedin/drafts.ts`, read on
  22 Oct 2026).
- **What you said before** lists up to three of the picked account's own
  comments on posts with the same words, so it never contradicts itself.

## The AI copies the best comments

The account's comments that got the most reactions are given to the AI as
examples of its voice. Each sent comment has a switch on the Comments tab,
"Keep out of the AI's examples". Help-only comments, answers and deleted
comments are never examples.

## Post, and every check

Post refuses, with one sentence each, when:

- the words are empty, over 1,250 characters, or hold a link of any kind;
- the account is paused, or its project, or LinkedIn on the project;
- the account is in its first 7 days, or Promo never saw it signed in;
- a young account already sent 20 comments and posts in the last day, the
  number in Settings → Behaviour;
- another of the person's accounts already commented on the post;
- a throwaway account would comment on an important account's post;
- a company page is picked on a throwaway account.

Words too like another account's comment or post, on LinkedIn, X, Medium or
Reddit, show a warning and are written on the comment. Post still goes.

Outside the account's workday a comment is not refused. It waits for the
next weekday at 8:00 on the account's own clock, and the line under Post
says when. Inside it, Post gives ten seconds to take the comment back.

## Reacting first

A comment on a post gives the post a Like a few seconds before typing, as a
person does, unless the account liked it already. A reply under a comment
does not react again, and nor does a comment written as a company page.
Before typing, the browser reads back who it is writing as, the member or
the picked page, and sends nothing when it is anyone else.

## Sending

The comment is typed in the account's own browser or in the LinkedIn app on
its phone, once, never tried again. Before typing, the browser looks under
the post for the same words from an earlier try, back to when it was first
pressed, and reports that one as sent instead of typing again. After the
press, every failure says "may already be on LinkedIn".

## The Comments tab

Every comment, reply and answer the project's accounts sent, newest first,
and a Failed list. Each sent one is read again once a day by a search
account: its reactions, the replies under it, and whether a stranger still
sees it. A new reply rings the bell once; a comment that no longer shows
rings once.

- **Answer** under a reply: the AI drafts it, and Send sends it from the
  account the person replied to.
- **Edit** changes the words. LinkedIn allows editing at any time, and the
  new words go through the same checks as a new comment.
- **Delete** removes it from LinkedIn. Only a pause holds a delete.
- **Connect** sends the post's writer a connection request (see
  [People](people.md)).
- **Try again** on a failed one goes through every check once more. It is
  never offered for a phone's failure that may have landed, because the app
  looks nowhere before it types.

## Are your comments still seen

Once a week a search account opens the account's five latest comments under
their posts. When none of them shows, the account is marked "Comments
hidden?" on the Accounts dashboard and the bell rings once. It is Promo's
best guess: LinkedIn never says. Check now on the Accounts dashboard takes the
look straight away.
