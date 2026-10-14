# Important and throwaway accounts

Every Reddit account is either important or a throwaway, and Promo keeps the
two groups apart so a banned throwaway can never drag an important account
down. Part 22 of the phone farm.

Tyler's plan: important accounts on real phones, throwaways on browser
profiles. A platform that bans a throwaway looks for what else it is linked
to, so nothing may link the two groups.

## The two groups

- **Every account starts as a throwaway,** including every account made before
  14 Oct 2026, until Tyler marks it.
- **Important is one way** (Tyler, 14 Oct 2026). An important account is never
  marked throwaway again, and it never goes back onto a browser profile.
- **Marking one important** is in the account's settings on the Reddit
  accounts dashboard: **Mark important**, after a confirmation. Only an
  account that already runs on a phone can be marked. One on a browser profile
  uses **Move to a phone** instead, which marks it important once the phone
  reads it signed in ([Reddit on phones](../reddit/reddit-on-phones.md)).
- **A throwaway on its way to a phone counts as important** for every rule
  below from the moment the move starts, and the move finishes only if the
  voice and project rules still hold then.
- **Bringing a retired account back** is refused when its project or voice
  now holds the other group.
- **The Reddit accounts dashboard** shows "Important" under an important
  account's status, and a menu filters the list to either group.
- **The Projects dashboard** lists a project's accounts under an Important or a
  Throwaway heading.

## What is refused

Each refusal says which accounts, phone or proxy are involved and what to do,
and changes nothing. Every one of them says "Important and throwaway accounts
are kept apart".

- **An important account on a browser profile.** It runs on a phone only, so
  its settings offer phones only.
- **A throwaway on a phone that held an important account** since that phone's
  last wipe. The phone's own history would tie the two together.
- **A phone and a browser profile sharing a proxy,** whichever is saved second.
  The reader browser is a profile too.
- **One voice used by both groups.** Two accounts writing alike is a link.
- **One project holding both groups** (Tyler, 14 Oct 2026). The two never
  promote the same thing.
- **A throwaway commenting on a post by an important account,** or answering a
  reply an important account wrote.
- **A throwaway naming an important account** (Tyler, 14 Oct 2026): writing
  u/name, linking its profile, or linking one of its own posts or comments, in
  a comment, an answer, an edit or a post of its own. A name that only starts
  the same, such as u/name_fan, is someone else and passes.
- **Both groups under one post** (Tyler, 14 Oct 2026): a comment from either
  group under a post the other group already commented on, or has a comment on
  its way to. The post is matched by Reddit's own id, so two keywords finding
  the same post count as one post.

The checks run when the button is pressed (Post, Reply, Save changes on an
edit, Post on a post of your own, Add account on a project, a voice picked, a
proxy picked, where an account runs), before anything is queued.

## Where it is

- The rules: `src/server/social/apart.ts`. The words: `src/lib/social/importance.ts`.
- The column: `promo_accounts.importance`, and `promo_phones.held_important_at`
  for the phone, both from `drizzle/0117_promo_phone_identity.sql`.
- The settings card: `src/components/social/accounts/importance-card.tsx`.
- The dashboards show these refusals word for word through
  `src/lib/social/refusal-words.ts`.
