# Promo's bell notices

The bell rings for the things that need a person: a new reply to answer, a
comment a moderator removed, a suspended account, a comment or post that did
not go out, and a proxy about to renew. Until 12 Oct 2026 the only notice
Promo sent was a dead proxy, and the account health code said "Nothing here
acts on a bad reading". Tyler picked this the same day.

## What rings it

- **A new reply** directly under a sent comment, which the last reading did not
  have: "New reply to your comment on "Which tool do you use?"", with who
  wrote it and what they said. Opens the comment's Replies window.
- **A comment going from there to gone**, as a stranger sees it: "Your comment
  was removed on ...". Rings once, when it goes, not on every reading after.
  Opens that one comment on the Comments screen.
- **Reddit marking an account suspended**, from the daily health reading:
  "Reddit suspended u/name". Rings once, when it happens. Opens the Reddit
  accounts dashboard.
- **A comment, an answer or a post of your own that did not go out**: "Did not
  go out: a comment", with Reddit's reason, and "may already be on Reddit" when
  the browser stopped part-way. Opens the Comments screen's Failed tab.
- **A proxy renewing in the next three days**: "Renews soon: US residential 3",
  with the day and the cost. Once per renewal date. Opens the proxy.

## The limit to know

Replies and removals are only found by a check of the comment, and checks run
only when Check is pressed on the Comments screen, because the automatic
re-check was not picked. So those two notices come after a Check. Failures,
suspensions and renewals ring by themselves.

## One notice per thing

A notice's id is worked out from what it is about (`noticeId` in
`src/server/social/notices.ts`), so the same thing happening again brings the
same notice back to the top, unread, instead of adding a second one. A second
new reply on one comment is the same notice with the newest words.

Because the id cannot carry an address, `promo_notices` remembers where each
one opens, and the bell asks for those once per page of notices (`detailsFor`
in `src/app/options.ts`). The icon and colour are worked out from the
notice's own heading, so a row is right on its first paint: each kind's
heading starts with words only it uses (`NOTICE_HEADINGS` in
`src/lib/social/notice-words.ts`).

A notice is never allowed to fail the work that rang it: a reading that worked
is never reported as failed because the bell could not be written
(`ringBell`).

The dead-proxy notice is older and keeps its own shape, in
`src/server/browser/notices.ts`: its id is the proxy's own. A phone that needs
a hand has a notice of the same shape, in `src/server/phones/notices.ts`, whose
id is the phone's own and whose heading names its shelf slot. The [Phones
dashboard](phones/phones-dashboard.md) says when it rings.

## Where it is

- Writing: `src/server/social/notices.ts`.
- Ringing: `src/server/social/reddit/comment-check.ts` (replies, removals),
  `src/server/social/health.ts` (suspended), `src/server/social/failures.ts`
  through the runner and the job queue (failures), and `ringProxyRenewals` in
  `src/server/social/upkeep.ts`.
- Drawing: `src/lib/social/notices.ts` and `src/lib/browser/notices.ts`.
- Table: `promo_notices`, added by `drizzle/0110_promo_new_features.sql`.
