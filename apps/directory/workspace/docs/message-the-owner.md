# Message the owner

A listing that somebody looks after can show "Message the owner" on its page.
A visitor writes a message and leaves their name and email. The site emails it
to the owner, and the owner replies straight to the visitor. The owner's own
email address is never shown.

## When the line shows

- **The site has it switched on.** Settings → Directory → Listing pages → "Let
  visitors message owners". It is off on every site until an admin turns it on.
- **The listing has an approved claim.** A listing with no owner, or with only
  a pending claim, shows nothing. So does a draft, and another site's listing.
- **The directory is open to the visitor.** A directory switched off, or kept
  for members from a signed-out visitor, has no listing page to send from.

The line sits in the listing's card of contact lines, above the claim line. It
opens a window with the visitor's name, email and message.

## What gets sent

- **To the owner:** "<name> sent a message about <listing>". The visitor's
  words, the site and the listing's name, and a button that opens the listing.
  Reply goes to the visitor's address, so the answer never passes through the
  site.
- **The owner's address** is the one they proved when they claimed the
  listing, the same address the claim's own emails go to.
- **To the visitor:** "Your message about <listing> was sent". It never holds
  the owner's address, and it never repeats the visitor's words. Anybody can
  type somebody else's address into the form, and a copy that quoted the
  message would let them send that person anything from this site.

Both emails go through the directory's own mail code (`server/directory/mail.ts`),
with the site's own sender.

## What the site keeps

One row per message in `directory_owner_messages`: the site, the listing, the
time, and whether the email to the owner was sent or failed.

- **The visitor's name, email and words are kept for 30 days**, long enough to
  answer a complaint about a message, and then emptied. The row stays. Tyler
  chose 30 days on 16 Oct 2026.
- **The emptying runs in the background**, at most once an hour on each
  server (`ownerMessageTextSweep` in `server/directory/owner-messages.ts`).
- **A failed send** leaves a failed row with the email provider's own words in
  `error`, and tells the visitor "Your message could not be sent. Please try
  again later." The provider's words never reach the visitor, because they can
  quote the address they failed on.
- **A failed copy to the visitor** changes nothing. The owner already has the
  message.

There is no admin screen for these rows yet.

## What stops it being used for spam

- **The request has to come from the site's own pages**, the same check every
  admin form runs.
- **The human check** (Cloudflare Turnstile) runs when the deployment has its
  two keys, the same check as sign-up. Without the keys, which is how local
  development runs, it is skipped.
- **Three limits an hour.** One visitor's network address: nine messages, and
  the tenth is refused. One email address: nine, whatever network it comes
  from. One listing: twenty, from everybody together. The limits are counted
  before the listing is looked up, so the form is not a free way to ask which
  listings take messages.
- **A form with an empty box** is refused before anything is counted, so a
  visitor who forgot their name does not lose one of their nine.

## How to check it

1. Switch it on: http://localhost:3015/admin/settings/directory, open
   "Listing pages", turn on "Let visitors message owners".
2. Open http://eat-drink-toronto.localhost:3015/directory/43-down. Its card has
   "Message the owner" above "Claimed".
3. Open http://eat-drink-toronto.localhost:3015/directory/archeo. Nobody owns
   it, so the line is not there.
4. Send a message from 43 Down. The owner's email and the visitor's copy both
   arrive, and the owner's address is in neither the page nor the copy.
