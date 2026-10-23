# LinkedIn search accounts

Every LinkedIn read goes through a search account: a browser profile signed
in to a spare LinkedIn account that only ever reads. The account that
comments never searches. This is the same answer Tyler accepted for X,
because LinkedIn shows almost nothing to a visitor who is not signed in, so
the signed-out reader that Reddit and Medium use cannot read it.

## What a search account reads

- each keyword's search, and a watched person's or page's newest posts;
- one post again with its top comments, when it is opened;
- each sent comment and post again, once a day, the way a stranger sees it;
- the weekly look at whether an account's comments still show;
- the people and pages the AI suggested, looked up before they are shown;
- a group's name and rules.

An account's own pages are read in its own browser instead, because only it
can see them: its feed, its waiting connection requests, who viewed its
profile, its numbers and its messages.

## Adding one

Settings → Behaviour, under LinkedIn: pick a browser profile from the list
and it is added at once.
Promo refuses a profile that holds an account of any network, the reader
profile, and a profile that already searches X, because one profile is one
person to a website. Sign the profile in to the spare LinkedIn account in its
browser window on the Browser profiles dashboard.

## The views it may spend a day

LinkedIn limits how much one account may look at in a day. Each read counts
the posts it put in front of the account, and a search account stops at the
number in Settings → Behaviour, 300 a day to begin with (Tyler: "You set it,
start at 300"). The day is counted in UTC, as X's is. The search account's
row shows "212 of 300 views today", and so does a line under the module's
notices.

## When one stops

A search account is looked at before and after every read. It stops for the
rest of the day, rings the bell once, and the read moves to another search
account, when:

- LinkedIn shows its limit page or a security check;
- it is signed out;
- LinkedIn is asking it for an emailed code;
- it is signed in as one of the accounts that comments.

With several search accounts, each read goes to the one with the most views
left, counting reads already waiting, so a batch spreads over all of them.
With none left, a read is refused with one sentence and never run in an
account that comments.

## The code

`src/server/social/linkedin/searchers.ts`, `src/server/social/runner.ts`
(`runLinkedinRead`), and the reads in `src/server/social/linkedin/search.ts`,
`comments.ts`, `reach.ts` and `groups.ts`.
