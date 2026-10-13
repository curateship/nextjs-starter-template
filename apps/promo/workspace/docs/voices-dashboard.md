# The Voices dashboard

A voice is how the AI sounds when it drafts a comment, and the lines it must
not cross. It is a record of its own, kept at `/admin/voices` and reached from
**Voices** under Projects in the left menu, so any number of accounts on any
network can share one. Tyler asked for this on 6 Oct 2026, so a second account,
or an Instagram account later, does not retype them.

What you make is not on the voice. Since 12 Oct 2026 it is the project's
description on the [Projects dashboard](projects-dashboard.md), and the voice
window has no "what you make" box. Tyler, 12 Oct 2026: the AI is told the
project description, and the voice keeps only how it sounds and its comment
rules.

## What it holds

The table is `promo_voices`: a name, how it sounds, the comment rules, the
person it belongs to, and the usual dates. Its `product` column, the old "what
you make" box, keeps its words and nothing reads it. It names no network. An account points at one through
`promo_accounts.voice_id`; deleting the voice leaves the account with none.

## The dashboard

Built like the Proxies dashboard. Each row shows the voice's name, its first
line, which accounts draft with it, and when it was last changed. A voice opens
as a window over the list with `?open=<id>` in the address, which is where the
Reddit account tab's "Open Main voice" link leads.

- **Saving a voice changes every account using it.** That is the point of sharing
  one, so the window says who uses it at the top.
- **Deleting says who loses it.** The question names the accounts, and they are
  kept with no voice.

## Trying a voice

**Try it**, at the bottom of a voice's window, writes two drafts in that voice
for a real post already found, so a voice is tuned in a minute: change its
words, try again, compare. Tyler picked this on 12 Oct 2026.

- **It uses the words in the window,** saved or not, so a change can be tried
  before it is kept.
- **The post** is picked from the newest posts found under any keyword. The
  drafts are told that post's own project's description, the same as Write
  with AI before an account is clicked.
- **Nothing is stored or sent.** The drafts never show on the post's own draft
  tiles.
- **Two drafts are one AI call,** counted as "reddit-comment" on the AI usage
  screen with the voice named.

The window part is `TryVoice` in `src/components/social/voices/voice-dialog.tsx`;
the call is `tryVoice` in `src/server/social/ai-tasks.ts`.

## An account with no voice

It drafts plainly: neither box is sent. What you make still comes from its
project's description. On the Projects dashboard, Write with AI's tooltip says
"No voice picked for this account, so drafts are plain", and the Reddit account tab links here. A voice
can be swapped on each row of the Reddit accounts dashboard.

## The first account's words

Migration `0096_promo_voices.sql` made one voice called "Main voice" for each
existing account, with that account's three boxes word for word, and pointed
the account at it. Measured on the local database on 6 Oct 2026, the words read
the same before and after. The old `voice`, `product` and `comment_rules`
columns on the account stay where they are, with their words, and nothing reads
them any more. On 12 Oct 2026 the voice's product text moved again, into the
first project's description (`drizzle/0108_promo_projects.sql`).
