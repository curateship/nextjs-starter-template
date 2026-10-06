# The Browser profiles dashboard

Every isolated browser in one table at `/admin/profiles`, reached from **Browser
profiles** in the left menu: which proxy it uses, whether it is open, who is
signed in inside it, and when it last ran. Opening a profile's browser, signing
in and clearing a captcha all start here. Tyler, 5 Oct 2026: "proxy and browser
isolation is an app wide feature, not just a reddit feature."

The behaviour is copied from anti-detect's profiles dashboard and rebuilt from
the shell's own table and windows, split by what each piece does:
`profiles-dashboard.tsx` for the table, `profile-dialog.tsx` for a profile's
window, `browser-window-dialog.tsx` for the browser itself, and
`profile-groups-dialog.tsx` for folders and labels, all in
`src/components/browser/`. [Browser profiles](profiles.md) explains the record.

## The table

- **Profile.** Its name, its label, its folder and its tags.
- **Proxy.** The proxy's name and its last test as a badge, the same badge the
  Proxies dashboard draws.
- **Browser.** Open, Opening, Stopping or Stopped, from the session row and the
  job queue. "On its old proxy" when the open browser went out through a proxy
  the profile no longer uses.
- **Signed in.** "Reddit: u/name", read from what the browser program saved after
  its last job. The dashboard never asks a browser.
- **Last ran.** When its newest browser run started.
- **Actions.** Open or show the browser, stop it, duplicate, settings, delete.

The list reads itself again every two seconds while a browser is opening,
closing or being checked, and stops when nothing is changing.

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

## A profile's own window

Clicking a profile opens it over the list, with `?open=<id>` in the address,
which is where the Reddit dashboard's "Open Main" link leads. Two tabs:

- **Settings.** Name and notes; the proxy, with its test badge, the warning
  about a change of country, and the restart offer for an open browser; the
  folder, the label and the tags.
- **History.** Every run of the browser and everything else that happened,
  newest first: when it opened, how long it ran, and how it ended. A run ends
  closed by a person, shut after an hour unused, died, failed to start, or
  closed when the browser program restarted. Besides runs it lists a proxy
  change, a browser found dead, and an open refused because the proxy was dead.
  Runs from before endings were kept are read from their status and words.

## Deleting

The question says what goes: the cookie volume, and so every sign-in inside,
naming the accounts that are signed out. Those accounts are kept with no
profile until one is picked in Settings.

A profile whose browser is open or opening is kept, and says so: removing a
volume a browser is writing to would corrupt it. The volume is removed before
the row, and if Docker refuses, the profile is kept and says why, so no cookies
are left behind with nothing pointing at them. A profile whose browser never
opened has no volume yet, so Docker is not asked at all.

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
link to the [Voices dashboard](../voices-dashboard.md). A profile that already
holds a Reddit account is not offered.

Every message on the Reddit dashboard about the browser names the profile and
the dashboard to find it on: "The browser is not signed in to Reddit. Open the
profile Main on the Browser profiles dashboard and sign in once." It shows in
the tooltip on the greyed-out Post to Reddit button.