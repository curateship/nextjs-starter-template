# Shared sounds and backgrounds

A member can tick Share on their own sound or background, and other members can
then find it, play it, save it and use it in their room or a room they host.
Built 10 Oct 2026 as uploads-and-sharing tasks 03 (sharing), 04 (rooms) and 05
(safety and admin).

## The one rule for who sees a file

Other members see a file only while all of these hold (`sharedWithOthers` in
`src/server/pomodoro/shared-media.ts`). Every list, page, pick, room and notice
reads this one rule, so a file that drops out of it disappears from all of them
on the next load.

- **Share is ticked, and the right to share was confirmed** the same time.
- **It is out of the bin.**
- **It is not waiting** for an admin's first check.
- **An admin has not taken it off.**
- **A finished file exists** (a first prepare is done, or an old cut plays
  while a new one is made).

Blocks hold as everywhere: a file is never listed, opened, picked or played
across a block, in either direction.

## Sharing a file

The Share tick is in the upload window and in the cog's window on My uploads.

- **A second tick appears under Share**: "I made this, or I have the right to
  share it. Files that break someone's copyright are taken down." Both must be
  ticked, and the server refuses a share without it. The time is kept in
  `share_confirmed_at`.
- **A file already shared does not ask again** when only its name or tags
  change.
- **The daily limit** is 10 files in 24 hours by default, set on Settings → App
  settings → Emergency switches, Sharing. Past it the server says "You can share
  10 files a day. Try again tomorrow." Unsharing never counts, and unsharing
  and sharing one file again counts once. A re-share also keeps the file's
  first share time and its announcement, so switching Share off and on never
  lifts it back to the top of "Shared by members" or tells followers again.
- **A member's first shared file waits for an admin** while "Check each
  member's first shared file" is on (on by default, same card). The card says
  "Waiting for a check". Once an admin approves one, that member's later shares
  go straight out. An admin's own shares never wait.
- **A file's public address never carries the member's own file name.** New
  uploads, new cuts and re-trim copies are stored as "<random id>_file.mp4"
  in the owner's bucket folder, so a renamed file does not keep
  "Sarah_Jones_vlog" in its address. Files stored before 10 Oct 2026 keep
  their old addresses.
- **Files ticked Share before 10 Oct 2026** were unticked by migration 0138,
  because nobody had confirmed the right to share them. On the live site no
  file had been ticked yet.

The owner's card on My uploads carries the mark: Shared, "Waiting for a
check", or "Taken off".

## Where shared files show

- **The owner's public page.** Two cards, Sounds and Backgrounds, with the
  newest 8 and "Show all", while "My shared sounds and backgrounds" is on in
  the public profile settings. That switch is off by default. With it off, the
  server reads no file at all. The files are read per visit, never held with
  the page, so an unshared file is gone on the next load.
- **"Shared by members" on Sounds and Backgrounds.** A pill row beside the
  title switches between Catalogue, Shared by members and, signed in, Saved.
  The list comes from the server 20 at a time, with a search over names and
  tags and a sort by Newest or Most used. The tag filter sits where the
  catalogue's does, in the same round tray, listing the shared files' own
  tags, and Shuffle and "+ Add" stay beside it, so switching tabs moves
  nothing (Tyler, 10 Oct 2026).
- **A page per file** at `/u/<handle>/files/<id>`: a preview, who shared it,
  Add, Save, Share to X and Report. An unknown handle, a profile switched off
  or hidden, a file not shared, binned or taken off, and a block all answer the
  same 404.
- **The front page**, for a visitor not signed in, when an admin features a
  file (below).

## Using someone else's file

- **The "+" adds it to your personal room.** The server lets a member pick a
  file that is theirs, or one shared with them, with nobody blocked. If the
  owner unshares, bins or deletes it, the room falls back to the default scene
  or to silence on the next load.
- **The heart saves it** to your Saved list without changing what plays
  (`pomodoro_saved_media`). A file that stops being shared drops out of Saved
  without an error. Saved files with tags also join your Show & shuffle tags
  (see [Shuffle and tags](shuffle-and-tags.md)).
- **Free accounts can play, add and save shared files.** This is the
  `sharedMedia` plan feature, on for every plan unless a plan sets it to false
  in Settings → Plans. The Free card on `/plans` lists it. Uploading and AI stay
  Pro.

## The credit

Wherever someone else's shared file plays, it names the owner: "by @sarah",
linked to their page. When the owner's page is off or hidden it says "by a
member" and names nobody.

- **Under the player** beneath the clock, at home and in a room: "Sound by
  @sarah · Background by a member". Your own files and catalogue items carry no
  credit, so the line is not drawn.
- **On every shared card**, with "Used by 14 people". The picture's corner
  carries two icons, Tyler's ask of 10 Oct 2026: the "+" that adds the file to
  your room, and a link to its own page. The heart sits beside the name on
  somebody else's file. The count is other
  people's personal rooms plus open hosted rooms using the file, and it is
  hidden below 3 so it never points at one person.

## Rooms

A host can play a shared file in their room (task 04).

- **Which files:** the host's own shared files, and shared files the host
  saved (`assertRoomFileUsable`). A file nobody shared on purpose never reaches
  whoever joins. Host a room lists them after the catalogue as "Yours: Rain on
  glass" and "Saved: Snow, by @sarah". The "+" on a shared card, or on your own
  shared upload, offers "Add to this room" while you host.
- **Each viewer's snapshot resolves the file for them** (`resolveRoomFiles`),
  with its name and credit. The room's line reads the file's name.
- **The fallback.** Once the file is unshared, binned or taken off, or its
  owner and the host block each other, the room plays silence or draws the
  default scene for everybody. When one viewer and the owner block each other,
  it stops for that viewer only. Unsharing, binning and an admin's take-down
  nudge every open room playing the file, so the change shows within a second
  or two rather than at the room's next phase. Measured: a member in the room
  saw "No sound" 4 seconds after the owner pressed Save.
- **"Add this to mine"** sits beside the credit in somebody's room. It saves
  the file and offers "Use it now", which puts it in your personal room for
  when you leave. Report sits beside it.
- **The room clock is untouched.** The checks run when a host saves the pair
  and when a snapshot is built, never on the fifteen-second clock.

## The bell

- **Somebody you follow shared** (`followed_share`): "Sarah shared a new
  sound." Sent once the file is out for everyone, so a file waiting for an
  admin or still being prepared is told later. One notice per followed person
  per day: later files that day fold into the unread one ("Sarah shared 3 new
  files."), and once it is read nothing more is said that day. It leads to
  their page. Nobody is told when their page is off or hidden.
- **The Monday note** (`share_weekly`): on Monday in the owner's own timezone,
  when at least 3 people added their shared files in the last seven days.
  "Your Rain on glass was added by 14 people this week." with the week's total
  under it. An "add" is the first time a person picked or saved the file
  (`pomodoro_media_adds`), so adding it twice counts once.
- **An admin took it off** (`share_removed`): "An admin stopped sharing Rain
  on glass." with the reason under it.
- **For admins** (`share_waiting`): "A shared file is waiting for a check."
  folding into a count, leading to Member uploads filtered to "Waiting to be
  shared", and turning read once nothing waits. The admin dashboard is a shell
  page with no place for an app's count, so the bell stands in for it.

All four run on the `pomodoro-shared-media` worker (`shared-media-notices.ts`)
or in the request itself. Each file and each week is claimed before anything is
sent, so overlapping passes tell nobody twice.

## Share to X

The file page has Share to X, an X post with the file's name and its address.
The page's Open Graph tags carry a picture: the picture itself, a clip's middle
frame, or for a sound a drawn card with its name, the credit and a waveform
(`/badge/file/<id>.png`, from `renderSoundCardSvg`). The local dev server turns
away any address ending in `.png`, the same as the profile's card, so locally
the card shows only without the extension.

## Reporting

- **Report** is on the file page, which every shared card links to, and the room
  credit. Anybody can send one, signed in or not, with a reason: copyright,
  not suitable, broken, or something else. It lands in the admins' report queue
  as "Shared file: <name>". One report per member per file, and the address
  limit profile reports use.
- **`/copyright`** is for someone with no account: name, email, the file's
  address, what work it copies, and a statement they tick. It lands in the
  same queue as "Copyright: <name>", or "Copyright, outside" when the address
  is not a shared file, and the admin answers by email. Five an hour per
  address, no CAPTCHA. See [Reporting and blocking](reporting-and-blocking.md).

## What an admin can do

All from Member uploads (`/admin/pomodoro-uploads`), whose rows now carry a
Sharing column and a filter (Shared, Waiting to be shared, Taken off sharing),
and a sharing menu on each shared row. The report queue's file rows carry the
same menu plus "Delete the file". Each press writes one row to
`pomodoro_audit_logs`, and only the take-down tells the member anything.

- **Unshare…** asks for a reason from a short list plus an optional line. The
  owner keeps the file, cannot share it again, and is told in the bell.
- **Approve** clears a waiting file and every later share of that member's.
  Approve and Unshare also work on several ticked rows at once.
- **Feature on the front page** puts one shared file under the timer on `/`
  for visitors not signed in, with play and the credit. Featuring another
  replaces it, and it leaves by itself once unshared. The read is held for a
  minute, like the live figures, so visits cost no queries.
- **Add to catalogue** copies the file into the catalogue as a Draft credited
  "@sarah", with its page as the source and a licence note saying the member
  confirmed the right to share. It opens the theme or sound window. The
  catalogue's worker still holds sounds to 2 to 5 minutes, so a short loop is
  refused there with the usual sentence.
- **Made-up members share free files.** Settings → App settings → Made-up
  members has "Give them files to share": Pixabay links, one per line, each
  given to the made-up member holding the fewest files and shared at once. Only
  Pixabay pictures and films are taken. Nothing happens until an admin presses
  the button. The made-up mark shows on their names in Member uploads, as on
  every admin list.

## Where the code lives

- `src/server/pomodoro/shared-media.ts`: the rule, the lists, saving, the
  credit, picking, and rooms.
- `src/server/pomodoro/shared-media-notices.ts`: the follower notice and the
  Monday note.
- `src/server/pomodoro/shared-media-reports.ts`: Report and `/copyright`.
- `src/server/pomodoro/admin-shared-media.ts`: unshare, approve, feature,
  copy to the catalogue, and the admins' waiting notice.
- `src/server/pomodoro/simulated-shares.ts`: files for made-up members.
- `src/lib/pomodoro/shared-media.ts` and `shared-media-reports.ts`: the
  wording and shapes the browser and server share.
- `src/lib/api/pomodoro/shared-media.ts`: the server functions. The list, the
  file page, Report, the copyright form and the featured file are open to
  visitors and written down in `src/app/open-endpoints.ts`.
- Components: `shared-media-card.tsx`, `shared-media-browser.tsx`,
  `profile-shared-panel.tsx`, `shared-file-page.tsx`, `share-fields.tsx`,
  `media-credit-line.tsx`, `report-shared-file-dialog.tsx`,
  `copyright-page.tsx`, `featured-shared-file.tsx` and
  `admin-share-actions.tsx`.
- Migrations: 0138 (the sharing columns, saved files, adds, weekly notes, the
  profile switch and file reports), 0147 (made-up members' imports) and 0148
  (the two new report kinds).
