# Pomodoro app docs

One line per doc. The repo's `docs/` covers what is true of every app; these
cover this one.

- [The product shell](product-shell.md) — the `_pomodoro` layout: the app's
  own sidebar, header and settings page; the admin chrome is never the
  frontend.
- [The account menu](account-menu.md) — the photo at the right of the
  header: what the menu holds, who sees each row, and where the photo is set.
- [Notifications](notifications.md) — the bell beside your photo, how a
  Pomodoro notice is told apart in the shell's tray, and the rules every notice
  follows.
- [The Pomoder look](pomoder-look.md) — the ported design tokens, fonts and
  orange accent for the member-facing screens, and the PomodoroShell wrapper
  that switches them on.
- [The timer](timer.md) — the ring at `/timer`, the 4-focus cycle, auto-start,
  and the session rows and daily stats every run writes.
- [One timer across devices](timer-across-devices.md) — the session row is
  the truth, every page polls it every 5 seconds, the last action wins, and a
  completion counts once.
- [The tab countdown](tab-countdown.md) — the time left in the browser tab's
  title and a filling ring in its icon, the worker that keeps them moving in a
  background tab, and how both go back on stop.
- [Zen mode](zen-mode.md) — the fullscreen timer: the ring, the phase and
  the task name, how you get in and out, and why the countdown never notices.
- [Tasks](tasks.md) — today's plan and the six days after it: create,
  inline edit, drag to reorder, complete and abandon, the focus task the
  timer counts on, the repeat rule, steps inside a task, and tags.
- [Projects](projects.md) — grouping tasks at the level people bill at, an
  hours target per week or month, what archiving does, and the per-project
  split in History.
- [The streak reminder](streak-reminder.md) — the evening nudge in the bell
  when the streak is alive and today is still empty; off until switched on,
  once a day at most, and never by email.
- [Session notes](session-notes.md) — the one line you jot after a focus
  finishes, why it never interrupts the break, and where it shows up.
- [Sessions before the long break](sessions-before-long-break.md) — how many
  focuses earn the long break, why it belongs to each preset, and what
  changing it does to the count.
- [Timer settings and rhythm presets](timer-settings.md) — the five tabs on
  Settings, and the Timer tab: durations, daily goal, auto-start, and built-in
  plus custom rhythms.
- [Pro perks](pro-perks.md) — what a paid plan unlocks and the one module
  that answers every can-do question.
- [Switching payments on](switching-payments-on.md) — the order to set Stripe
  up in, what each money path does, and how to prove it.
- [The plans page](plans-page.md) — `/plans`, the product's own pricing
  screen: where the figures come from, what each button does, and why the
  shell's `/pricing` is a different page.
- [Profile](profile.md) — public display name, the day-boundary timezone and
  the leaderboard opt-in.
- [The public profile](public-profile.md) — the page at `/u/<handle>`, the
  switch per section, the handle rules and what a stranger can and cannot
  see.
- [Following, cheering and finding people](following.md) — the follow, the
  Following board, the cheer, and the four ways somebody finds a profile.
- [Reporting and blocking](reporting-and-blocking.md) — the Report button on
  a public profile, what an operator can do about it, and the block that
  holds everywhere.
- [Streak badge](streak-badge.md) — the opt-in image you can embed on a blog,
  the secret address that serves it, and what revoking does.
- [Completion chimes](completion-chimes.md) — a separate chime for a focus
  ending and a break ending, five choices including silence, with Preview.
- [The personal room](personal-room.md) — every account's own room holding
  its sound and theme, a hosted room's pair replacing it while you are in
  one, a guest's random pair, and previewing before adding.
- [Sounds](sounds.md) — the Live catalogue sounds, the header player that
  survives navigation, the sleep timer and the completion chime.
- [The break card](break-card.md) — the short and long break checklists under
  the timer and in a room.
- [The dark mode shade](dark-mode-shade.md) — the four steps from near black
  to soft grey in Settings → Appearance, which greys move and which stay.
- [Backgrounds](backgrounds.md) — the Live catalogue scenes and the backdrop every
  member screen draws behind its content.
- [Focus history](history.md) — the four-range report as Tyler drew it: the
  strip, By day, This week, the hour-of-day chart, top tasks and projects,
  project targets, the sessions table with its tag filter, CSV export, and the
  badges.
- [Achievements](achievements.md) — the ten badges, the panel at the foot
  of History with each locked badge's progress, and why a badge can only
  ever be awarded once.
- [Guest mode and the one-time import](guest-mode.md) — the whole product
  without an account, and the first sign-in copying it over exactly once.
- [The front page](landing-page.md) — `/` is the timer, for guests and
  accounts alike.
- [Leaderboard](leaderboard.md) — the opt-in ranking over three windows,
  Who you focus with and Your groups, and how the page is drawn.
- [Private focus groups](focus-groups.md) — an invite-only board among people
  you know, the caps, and why being in a group never lists you publicly.
- [Live figures on the public front page](public-live-figures.md) — the hours
  and open-rooms rows a visitor sees, and the floor that hides one on a quiet
  week.
- [Focus rooms](rooms.md) — the three columns (personal, joined, hosted)
  with the one you are in lit, shared timers with a host, the Rhythm preset
  picker in Host a room, the fifteen-second
  server clock, SSE snapshots, invite links, the task beside a member's name,
  saved rooms, and who you focus with.
- [Scheduled rooms](scheduled-rooms.md) — booking a room for later or every
  week, the invitation emails, and the worker that opens the room on time.
- [Room chat and moderation](room-chat-and-moderation.md) — talking in a
  room, the five reactions, reporting a message, and the host's delete,
  remove and ban.
- [Shuffle and tags](shuffle-and-tags.md) — the "Show & shuffle" tag filter
  and the Shuffle switch beside each page's title, shuffle on by default, how
  the next sound and theme are picked when a sound ends, and a host shuffling
  a room.
- [Admin safety tools](admin-safety-tools.md) — the Chat and Bans pages,
  warnings, suspensions, blocked words, the pause switches and STAFF.
- [Rooms in the admin](rooms-admin.md) — closing, editing and featuring
  rooms, invitations, house presets and room limits.
- [Admin settings](admin-settings.md) — Pomoder's tabs under Settings → App settings, saving by themselves: shuffle for
  guests, the default theme and sound, seasons and the new-account timer.
- [Themes and sounds in the admin](catalog-admin.md) — the catalogue in the
  database, the Themes and Sounds dashboards, the window, the 2-to-5-minute
  rule, uploads and the worker, and what members fall back to.
- [Admin sections](admin-sections.md) — every Pomoder operator page under
  `/admin`, from focus data and the report queue to member profiles, uploads,
  badges, groups and projects, and what each delete takes with it.
- [Members in the admin](admin-members.md) — the window a member's name opens
  on any admin list, fixing a broken streak day without touching hours or the
  leaderboard, and the private admin notes.
- [Made-up members](made-up-members.md) — the accounts that focus every day
  so the site never looks empty: the Settings tab, their working day, the
  worker, their history, and the mark only the admin sees.
- [My uploads](my-uploads.md) — the page that manages every own file: marks,
  tick boxes, the 30-day bin, stills for clips, the space warning, Download,
  and AI files named after their prompt.
- [Your own backgrounds and sounds](own-media-uploads.md) — what a Pro member
  may upload, the upload window (name, tags, Share, trim, several files), the
  FFmpeg re-encode, and where the files live.
- [AI backgrounds and soundscapes](ai-generation.md) — the prompt box, the
  monthly credits, the rule that a failed generation is refunded, and what
  each one costs on the admin's AI usage page.
- [Pomodoro and Custom Shell](shell-integration.md) — what the shell gives
  this app, the three things `src/app/` claims, and what the 27 Sep 2026 merge
  brought.
- [Launching Pomodoro](launch.md) — the two Coolify resources, every value and
  who supplies it, the HTTPS requirement, making the first admin, the live
  walk-through, and what the 8 Oct 2026 laptop dry run proved.
