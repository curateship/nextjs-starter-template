# Voices

A voice is how the AI sounds when it drafts a comment, and the lines it must
not cross. It is a record of its own, kept in the Voices section of the
[Projects dashboard](projects-dashboard.md) (`/admin/projects?section=voices`),
so any number of accounts on any network can share one. Tyler asked for this on 6 Oct 2026, so a second account,
or an Instagram account later, does not retype them.

What you make is not on the voice. Since 12 Oct 2026 it is the project's
description on the project's own page, and a voice has no "what you make"
box. Tyler, 12 Oct 2026: the AI is told the
project description, and the voice keeps only how it sounds and its comment
rules.

## What it holds

The table is `promo_voices`: a name, how it sounds, the comment rules, the
person it belongs to, and the usual dates. Its `product` column, the old "what
you make" box, keeps its words and nothing reads it. It names no network. An account points at one through
`promo_accounts.voice_id`; deleting the voice leaves the account with none.

## The Voices section

Since 12 Nov 2026 Voices is a section of the Projects dashboard, in the
dashboard's one header and table shape (Tyler: "consolidate projects, voices,
accounts, archive and messages into one cohesive 3 panel design"). Each row
shows the voice's name, its first line, which accounts draft with it, and when
it last changed. A voice opens on the right with `?open=<id>` in the address. The
old `/admin/voices` is gone since 13 Nov 2026 ([Old addresses](old-addresses.md)).

- **The voice on the right saves as it is typed.** Name, How it sounds and
  Lines the AI must not cross each save 700ms after the last letter, and when
  the box is left, with Saving… and Saved in the page header. A voice can't be
  saved with no name.
- **Saving a voice changes every account using it.** That is the point of
  sharing one, so who uses it is the line under its name.
- **New voice** asks for a name and opens the new voice.
- **Deleting says who loses it.** Delete is in the voice's ⋮, its row's
  right-click menu and the selected rows' menu; the question names the
  accounts, and they are kept with no voice.
- **The Projects block** narrows nothing here, because a voice belongs to no
  project.

## Trying a voice

**Try it**, under a voice's words on the right, writes two drafts in that voice
for a real post already found, so a voice is tuned in a minute: change its
words, try again, compare. Tyler picked this on 12 Oct 2026.

- **It uses the words on screen,** saved or not, so a change can be tried
  before it is kept.
- **The post** is picked from the newest posts found under any keyword. The
  drafts are told that post's own project's description, the same as Write
  with AI before an account is picked.
- **Nothing is stored or sent.** The drafts never show on the post's own draft
  tiles.
- **Two drafts are one AI call,** counted as "reddit-comment" on the AI usage
  screen with the voice named.

The voice on the right, Try it included, is `src/components/social/voices/voice-record.tsx`;
the call is `tryVoice` in `src/server/social/ai-tasks.ts`.

## An account with no voice

It drafts plainly: neither box is sent. What you make still comes from its
project's description. On a project's own page, Write with AI's tooltip says
"No voice picked for this account, so drafts are plain", and the Reddit account tab links here. A voice
is picked in an account's ⋮, in the Accounts section of the Projects dashboard.

## The first account's words

Migration `0096_promo_voices.sql` made one voice called "Main voice" for each
existing account, with that account's three boxes word for word, and pointed
the account at it. Measured on the local database on 6 Oct 2026, the words read
the same before and after. The old `voice`, `product` and `comment_rules`
columns on the account stay where they are, with their words, and nothing reads
them any more. On 12 Oct 2026 the voice's product text moved again, into the
first project's description (`drizzle/0108_promo_projects.sql`).
