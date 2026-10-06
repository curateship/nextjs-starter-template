# Backing a profile up

A profile's cookies are one Docker volume on one machine. A signed-in, aged
account is the one thing in this app that cannot be rebuilt, and before backups
one deleted volume lost it. A backup is a copy of that whole volume, kept in
Cloudflare R2, that can be put back on this machine or another one.

It is on the **Backups** tab of a profile's window on the Browser profiles
dashboard.

## What is in one

The whole volume: the cookies and every other file Firefox keeps, and the
profile's identity file beside them, so a restored profile is the same machine
to every site, not just signed in. Measured on 6 Oct 2026, a profile volume of
155MB, most of it Firefox's page cache, made a 52MB backup.

The page cache is kept rather than filtered out. Leaving it out would mean
unpacking the archive somewhere first, and nothing plain is ever written to a
disk (below).

## Encrypted before it leaves

The archive holds live sign-in cookies for every account in the profile, so
it is encrypted with the server's key before a byte of it leaves, with
AES-256-GCM. The key is made from `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` the same
way the shell makes the key for stored secrets. A backup opens only where that
setting is the same.

**Nothing plain touches a disk.** Docker hands the volume over as an archive
read straight out of a container that never runs. It is compressed and
encrypted in the browser program's memory, and only the encrypted bytes go to
R2. Checked on 6 Oct 2026: fetched from the bucket with the app's own keys, a
backup starts with the mark `PRB1`, holds no readable word, and is not a
compressed file at any offset.

The R2 address is `promo-backups/<profile id>/<backup id>.bin`. The bucket may be
public, which is exactly why the encryption is what protects it.

## Taking one

**Back up now** writes a `backup` job, and the browser program does it, because
it is the program with Docker. It is refused while the profile's browser is
open, because an open browser writes its cookie files as it goes and a copy
taken mid-write can be torn. It is refused for a profile whose browser never
opened, which has nothing to back up yet.

The newest 5 are kept for each profile. Taking a sixth deletes the oldest from
R2 and from the list. One R2 will not delete keeps its row, so it is still
listed and the next backup tries again.

## Restoring one

**Restore** writes a `restore` job. The backup is read from R2 and checked
whole before anything on this machine changes, so one that cannot be opened,
because the key is different or the file is damaged, leaves the volume as it
was and says why.

On a machine with no volume for the profile, it makes one with the profile's
own volume name and unpacks the backup into it. Where the profile already has
browser data, the restore is refused by default: "Lane test already has browser
data on this machine. Restoring replaces it, so choose Replace and restore to
go ahead." Only then does the tab offer **Replace and restore**, which deletes
the volume and restores into a new one. Restoring is also refused while the
profile's browser is open.

Checked on 6 Oct 2026: a profile's volume was deleted by hand and restored, and
a fingerprint taken over all 193 of its files matched the one taken before, with
the files still owned by the browser's own user.

The profile's history records each backup and each restore.

## Moving a profile to another machine

A backup is how a profile moves, because the sign-in travels inside it. Two
things have to match on the other machine: the profile's row in that machine's
database, since the list of backups is read from there, and
`CUSTOM_SHELL_SECRET_ENCRYPTION_KEY`, since the backup opens only with the same
key. Running browsers on the server is file 05's part 20, which waits on Tyler.

## Deleting a profile

Deleting a profile deletes its backups too, from R2 first. See [the Browser
profiles dashboard](profiles-dashboard.md).

## Where it lives

`src/server/browser/backups.ts` takes, restores, lists and removes backups.
`src/components/browser/profile-backups-panel.tsx` is the tab. The table is
`promo_profile_backups`, made by `drizzle/0098_promo_limits_lanes_backups.sql`.
