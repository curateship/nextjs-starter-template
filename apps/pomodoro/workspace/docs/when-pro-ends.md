# When Pro ends

When a member's Pro stops, nothing of theirs is deleted. What needs Pro stops
playing or opening for them, and all of it comes back unchanged the day Pro
comes back.

## The rule, as Tyler set it on 12 Oct 2026

Tyler confirmed the task's proposal as written and settled the cases it left
open:

- **Nothing is ever deleted.** Uploads, AI files and saved choices stay
  stored.
- **The personal room falls back to a free sound and background** while Pro
  is off, and the Pro choice comes back with Pro.
- **Pro sounds, Pro backgrounds, own uploads and AI files show locked** with
  "Comes back with Pro".
- **History beyond the free range is hidden**, as it already was for any free
  account (`history.ts` checks `canUseLongRangeReports` on every read).
- **Weekly booked rooms stop opening while Pro is off.** The rule stays saved,
  invitees with an account are told it is paused, and it opens on its days
  again once Pro is back.
- **A one-off booked room is cancelled** if its host has no Pro when its time
  comes, and invitees with an account are told it won't open. It has no next
  date to wait for.
- **Files the member shared stay up for everyone else.** Only the owner's own
  use locks.
- **The "your plan ended" notice belongs to the shell**, with the other
  billing notices, in custom-shell's
  `workspace/tasks/features/billing/card-declined-and-plan-ending-notices.md`.

## What a lapsed member sees

- **On Sounds and Backgrounds**, under the title: "Your sound, Fireplace,
  comes back with Pro. Until then your room uses a free one." The room plays
  what somebody who never picked gets: shuffle, or the admin's default.
- **On My uploads**, above their files: "Your files are kept. They come back
  with Pro." Each card is greyed with a lock and the mark "Comes back with
  Pro". It does not preview, and it has no "+" to add it anywhere. The cog
  and the bin still work, so they can still rename or delete their own files.
- **The space line reads "1.2 GB kept"** instead of "1.2 GB of 0 B".
- **In the bell, when a booked room doesn't open.** Invitees read "Deep Work
  won't open." or, for a weekly room, "Deep Work is paused for now." They are
  never told why, because that is the host's billing. The host reads "Your
  room Deep Work won't open. Hosting comes back with Pro." (or "Your weekly
  room … is paused"), which leads to `/plans`.

## What does not change

- **A room the lapsed member is in keeps its host's pair.** A Pro host's sound
  plays for everyone in their room, Pro or not (`pro-perks.md`).
- **A room the lapsed member is hosting right now keeps running** with its
  pair until it closes. Only new and booked rooms need Pro.
- **Someone else's shared file stays playable** in the lapsed member's room.

## How it works

- **The saved choice is never rewritten.** `loadMediaBootstrap` in
  `src/server/pomodoro/personal-room.ts` checks the plan each time the room
  is read. A Pro catalogue item without `canUsePremiumMedia`, or the member's
  own file without `canUploadMedia`, is sent to the page as `held` and
  swapped for the unset pair. Own files also drop out of the shuffle and tag
  groups. Picking an own file without the plan is refused
  (`UPGRADE_REQUIRED:uploadMedia`).
- **Booked rooms are checked at their start time.** `openDueRooms` in
  `src/server/pomodoro/scheduled-rooms.ts` asks whether the host may host
  (Pro, or a made-up member). If not, `holdScheduledRoom` closes the room the
  way the host's own cancel does and writes the notices.
- **A weekly rule remembers its pause** in `pomodoro_room_repeats.paused_at`
  (migration 0156). A day skipped because the host has no Pro sets it and
  tells everyone. Later skipped weeks see it set and tell nobody again. The
  first day that books again clears it.
- **The laptop's catalogue has no Pro sounds or backgrounds today**, so the
  Pro-item half of the rule changes nothing there until an admin marks an
  item Pro in Settings. It is covered by tests.
