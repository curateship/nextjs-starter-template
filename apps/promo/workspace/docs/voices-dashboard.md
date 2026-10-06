# The Voices dashboard

A voice is what the AI is told when it drafts a comment: how you sound, what
you make, and the lines it must not cross. It is a record of its own, kept at
`/admin/voices` and reached from **Voices** in the left menu, so any number of
accounts on any network can share one. Tyler asked for this on 6 Oct 2026, so a
second account, or an Instagram account later, does not retype all three.

## What it holds

The table is `promo_voices`: a name, the three boxes, the person it belongs to,
and the usual dates. It names no network. An account points at one through
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

## An account with no voice

It drafts plainly: none of the three boxes is sent, so a draft never mentions
what you make. That is exactly what an account with three empty boxes did
before voices existed. The Reddit dashboard says "No voice picked, so drafts
are plain" beside Write with AI, and the Reddit account tab links here.

## The first account's words

Migration `0096_promo_voices.sql` made one voice called "Main voice" for each
existing account, with that account's three boxes word for word, and pointed
the account at it. Measured on the local database on 6 Oct 2026, the words read
the same before and after. The old `voice`, `product` and `comment_rules`
columns on the account stay where they are, with their words, and nothing reads
them any more.
