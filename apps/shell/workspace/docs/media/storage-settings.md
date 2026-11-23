# Where uploaded files are kept

Every picture, video and file an admin or member uploads goes into one
Cloudflare R2 bucket. The bucket is filled in on the **Cloudflare R2** card of Settings → General
settings, so a
server needs no `CUSTOM_SHELL_R2_` environment variables at all.

## The five values

All five are needed before a single upload can succeed.

- **Account ID.** The Cloudflare account the bucket belongs to. It is what the
  app builds the R2 address from.
- **Access key ID** and **secret access key.** The two halves of one R2 API
  token, made in the Cloudflare dashboard under R2 → Manage API tokens. The
  token needs read and write on the bucket.
- **Bucket name.** The bucket must already exist. Nothing in this app creates
  one.
- **Public address.** The address a browser fetches a finished file from,
  either the bucket's custom domain or its `r2.dev` address once public access
  is switched on. An upload is refused before a byte is written when this is
  empty, because the app would have nowhere to point people afterwards.

A trailing slash on the public address is stripped when it is saved. Left on,
the glued-on file name would produce a double slash, which R2 serves as a
different and missing file.

## What is refused

Three of the five values are checked before anything is saved or tested, and a
refusal names which one and why.

- **Account ID:** letters and digits only. The account ID and the bucket name
  both become parts of the address the server signs a request to and sends the
  credentials to, which is `<bucket>.<account>.r2.cloudflarestorage.com`. An
  account ID ending in a slash ends that address early, so the whole signed
  request would go to a machine somebody else chose. Until this screen existed
  the value came from the server itself and only the person running the server
  could set it; it now arrives from a browser, so it is checked. A real
  Cloudflare account ID is 32 hexadecimal characters and passes untouched.
- **Bucket name:** letters, digits, dots, hyphens and underscores.
- **Public address:** has to start with `http://` or `https://`. It is glued in
  front of a file name and handed to every visitor's browser, so it has to be an
  address and nothing else.

The server still accepts an empty box, and stores it as "fall back to the
server's own setting", not "use nothing". The screen no longer sends one for
the account ID, access key ID or bucket name, because the test refuses a set
with any of them empty (see the next section). The public address can still be
emptied from the screen.

## What is stored, and how

The five values live in one row of the `storage_settings` table, always under
the id `r2`. The secret access key is scrambled with the same AES-256-GCM
treatment the AI provider keys get, so a stolen database backup holds no usable
credential. The other four are stored as typed, because none of them opens the
bucket on its own.

The browser is never sent the secret. The Storage tab shows only its last four
characters.

Scrambling depends on the server's `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY`. If that
value changes or goes missing, the saved secret can no longer be read back, and
the tab says so instead of pretending the bucket is fine. The fix is pasting the
secret again.

## Saved settings and the server's own settings

The saved row wins, field by field. A field left empty falls back to the
matching `CUSTOM_SHELL_R2_` environment variable, and the tab marks any field
the server is supplying so it is obvious which values are not coming from the
saved row.

That fallback is what lets an already-running deployment keep working the day
this arrives. Nothing is copied out of the environment into the database, and
nothing has to be changed on a server that is already set up.

**Remove these settings** deletes the row. The environment variables take over
if the server has them. If it does not, uploads stop and pictures already
uploaded stop loading, until a bucket is saved again. Nothing inside the bucket
itself is touched.

## New details are tested before they are kept

The card saves itself, like every Settings card, with no Save button. Unlike
the others it has no timer, and nothing typed goes live until it passes the
test (`check` in `src/components/settings/storage-settings.tsx`):

- **Typing changes nothing.** Where files go stays the same while a box is
  being filled in.
- **Leaving a box, or Enter, with something changed** tests the five values on
  screen together. A pass saves them. A save the server refuses says so in the
  error toast.
- **A fail is not saved.** The boxes keep what was typed and turn red, and a red
  line under them says "Not saved, so the bucket in use stays in use." with the
  reason. An incomplete set (an empty bucket name, say) is a fail too, with the
  box it is missing.
- **Leaving a box that changed nothing does nothing.** Tabbing through the card
  tests and saves nothing. A trailing slash on the public address is not a
  change, because it is stored stripped.
- **A pass shows a tick** beside "It works. Cloudflare opened the bucket and
  listed it.", so a pass and a fail differ by more than colour.
- **The test does not check the public address.** It proves the account, the
  key and the bucket, and the public address is never sent to Cloudflare. A
  mistyped public address that starts with `https://` passes, is saved on
  leaving the box, and breaks every picture's address until it is put right.

Until 13 Nov 2026 the card saved all five values 1.2 seconds after typing
stopped, untested. A half-typed account ID went live at once and broke uploads,
and every picture already uploaded, before Test was ever pressed. Emptying the account ID, access key ID or bucket name to hand that one value
back to the server's `CUSTOM_SHELL_R2_` setting fails the test, so it is never
saved. The only way back to the server's settings is **Remove these settings**,
which removes all five saved values at once.

## Test this bucket

The Test button asks R2 to list one object. That proves the account, both key
halves and the bucket name together, and it changes nothing in the bucket. It
runs the same check as leaving a box, so changed details that pass are saved
by it too.

It tests the values on screen, not the saved ones. A secret box that has not
been touched falls back to the saved secret.

Cloudflare's own wording comes back on a failure rather than one invented
sentence. "No such bucket" and "signature does not match" are different problems
with different fixes, and one message for both hides that.

A wrong account ID is the exception. It never reaches Cloudflare at all, because
the address built from it does not exist, and the failure arrives as a DNS or
TLS error full of OpenSSL line numbers. That one is replaced with a sentence
naming the account ID as the likely cause.

## Why reads are remembered for a few seconds

Every upload, every delete and every public address asks for these settings, so
reading the row each time would put a database query in front of every media
operation. The row is remembered for 15 seconds. Saving drops that memory at
once, so a change takes effect immediately on the server that took the save;
a second server behind the same database picks it up within the window.

The environment variables are read afresh every time and are never part of what
is remembered.
