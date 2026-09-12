# Where uploaded files are kept

Every picture, video and file an admin or member uploads goes into one
Cloudflare R2 bucket. The bucket is filled in on **Settings → Storage**, so a
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

An empty box is always allowed. Empty means "fall back to the server's own
setting", not "use nothing".

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

## Test this bucket

The Test button asks R2 to list one object. That proves the account, both key
halves and the bucket name together, and it changes nothing in the bucket.

It tests the values on screen, not the saved ones, so a bucket can be checked
before it is saved. A secret box that has not been touched falls back to the
saved secret.

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
