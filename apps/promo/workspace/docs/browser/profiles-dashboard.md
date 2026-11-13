# Profiles, on the Anti Detect dashboard

Every isolated browser in one table, the Profiles section of [the Anti Detect
dashboard](../anti-detect-dashboard.md) (`/admin/anti-detect?section=profiles`;
the old `/admin/profiles` is gone, [Old addresses](../old-addresses.md)): which proxy it uses, whether it is
open, who is signed in inside it, and when it last ran. Opening a profile's browser, signing
in and clearing a captcha all start here. Tyler, 5 Oct 2026: "proxy and browser
isolation is an app wide feature, not just a reddit feature."

The behaviour is copied from anti-detect's profiles dashboard. Since 12 Nov
2026 the table is `src/components/anti-detect/profiles-section.tsx` and a
profile opens on the right (`profile-record.tsx`); `profile-dialog.tsx` holds
the settings form and the New profile window, `browser-window-dialog.tsx` the
browser itself, and `profile-groups-dialog.tsx` folders and labels, in
`src/components/browser/`. [Browser profiles](profiles.md) explains the record.

## The table

- **Profile.** Its name, its label, its folder and its tags.
- **Proxy.** The proxy's name and its last test as a badge, the same badge the
  Anti Detect dashboard's Proxies draws.
- **Browser.** Open, Opening, Stopping or Stopped, from the session row and the
  job queue. "On its old proxy" when the open browser went out through a proxy
  the profile no longer uses.
- **Signed in.** "Reddit: u/name", read from what the browser program saved after
  its last job. The dashboard never asks a browser.
- **Last ran.** When its newest browser run started.
- **Actions.** Open the browser, or show it while it runs, and delete. Stop
  and Duplicate are in the row's right-click menu and the profile's ⋮.

The list reads itself again every two seconds while a browser is opening,
closing, being checked or being backed up, and stops when nothing is changing.

## The browser, inside the app

Pressing Open writes an `open` job and shows a large window over the list. The
window frames Neko's own page with the name and the password already in its
address, so nobody types either. While it opens, it says what it is waiting for
in words: the browser program to pick the job up, then the container, which
takes 30 to 90 seconds cold. If the open failed, it says why, for example that
the proxy failed its last test.

Beside the picture are **Stop the browser**, **Open in a new tab** and **Check
who is signed in**. Stop swaps the picture for "Stopping" at once. Check is the
one look that moves the page, to Reddit's front page; the row updates when it
finishes. Closing the window leaves the browser running, so a sign-in is there
the next time it is opened.

The stream is published on this computer only. Reaching it from the server is
file 05's part 20, and only the address the window is handed has to change.

## A profile on the right

Clicking a profile opens it in the right panel, with `?open=<id>` in the
address, drawn as the shell's records are. What can be changed is in its ⋮,
each row saving itself; the body is grey cards (Browser, Signed in, This
profile's machine, What a site sees, Backups, History); the footer opens or
shows the browser ([the Anti Detect dashboard](../anti-detect-dashboard.md)).
What each part holds:

- **Settings.** Name and notes; the proxy, with its test badge, the warning
  about a change of country, and the restart offer for an open browser; the
  folder, the label and the tags.
- **Identity.** The machine the profile presents, as a page read it: operating
  system, browser, screen, graphics card, fonts, clock and language, with a
  "Make a new identity" button that asks again inline before it does anything.
  Below it, "Check what a site sees" and the last result line by line. See
  [the isolated browser](isolated-sessions.md).
- **Backups.** "Back up now", the backups kept with when each was taken and
  its size, and Restore beside each. A restore that would replace browser data
  already on this machine comes back refused with the reason, and only then is
  "Replace and restore" offered. While one runs the tab says "Backing up" or
  "Restoring". See [backups](backups.md).
- **History.** Every run of the browser and everything else that happened,
  newest first: when it opened, how long it ran, and how it ended. A run ends
  closed by a person, shut after an hour unused, died, failed to start, or
  closed when the browser program restarted. Besides runs it lists a proxy
  change, a browser found dead, an open refused because the proxy was dead, a
backup, and a restore.
  A run on a different browser image than the one before says "First run on a
  new browser build".
  Runs from before endings were kept are read from their status and words.

## Deleting

The question says what goes: the cookie volume and the backups, and so every
sign-in inside, naming the accounts that are signed out. Those accounts are kept with no
profile until one is picked in Settings.

A profile whose browser is open or opening is kept, and says so: removing a
volume a browser is writing to would corrupt it. The volume is removed before
the row, and if Docker refuses, the profile is kept and says why, so no cookies
are left behind with nothing pointing at them. A profile whose browser never
opened has no volume yet, so Docker is not asked at all.

The backups go first, from R2 and from the list. If R2 will not remove one, the
profile is kept and says "its backups could not be removed from R2", so no
encrypted cookies are left in the bucket with nothing to find them by.

## Folders, labels and tags

Copied from anti-detect. A person starts with three labels, Ready, Warming and
Banned, and can rename them and add more in **Folders and labels**, which saves
each change as it is made. Deleting a folder or a label leaves its profiles,
without it. The list filters by folder, label and tag; on a phone the filters
are hidden so the search box has room.

Ticking rows offers **Move to folder**, **Set label**, **Add tag** and
**Delete**. Each is one statement scoped to the person and says how many rows it
changed: "3 profiles labelled." A tag a profile already has, ignoring case, is
not added twice, and a profile stops at twenty tags.

**Duplicate** makes a new profile with the same proxy, notes, folder, label and
tags, a cookie volume of its own and none of the original's identity, so two
profiles never share either. Making a new identity is file 04's job.

## The Reddit account tab

The Reddit account tab in Settings no longer holds the proxy, the browser
buttons, or the AI's words. It has two pickers: which browser profile the
account uses, with a link to it here, and which voice it drafts with, with a
link to the [Projects dashboard's Voices](../voices-dashboard.md). A profile that already
holds a Reddit account is not offered.

Every message on the Projects dashboard about the browser names the profile and
the dashboard to find it on: "The browser is not signed in to Reddit. Open the
profile Main in the Anti Detect dashboard's Profiles and sign in once." It shows in
the tooltip on the greyed-out Post comment button.