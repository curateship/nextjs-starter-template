# Profile

The product's Settings page (`/settings`, card
`src/components/pomodoro/profile-settings-panel.tsx`) holds the three
app-level facts about a person, in `pomodoro_profiles` (migration
`0085_pomodoro_profiles.sql`):

- **Public display name** (up to 50 characters, may be empty) — the name
  other people see on the leaderboard, in rooms and on
  [the public profile](public-profile.md). It used to be the only name
  anybody ever saw; since the public profile exists, a person with no
  display name is named by their handle there instead.
- **Timezone** — an IANA name; an unrecognised one is refused with a plain
  sentence. Every "today" the app computes (goals, streaks, task days, the
  rollover) goes through `userToday` in `src/server/pomodoro/profile.ts`:
  the saved timezone wins, and until one is saved the browser's own is used
  and quietly recorded, so travelling never silently moves the day
  boundary.
- **Leaderboard opt-in** — off by default; opting out hides the account
  from the leaderboard immediately (the leaderboard query filters on it).

The three fields appear once the saved profile arrives; until then the card
shows "Loading your profile…". They are not offered sooner because the load
fills them in, and a name typed into an empty box would be overwritten the
moment it landed.

## When it fails to load

The card says "Your profile could not be loaded" inside its own frame, with
Try again, which asks again without reloading the page. The fields stay hidden
until a load works, because an empty name box would read as having no name.

## How a save reports itself

The same way every other Settings card does, and
[Timer settings](timer-settings.md) has the rule in full: a save that worked
raises a success toast that clears itself, a save that failed raises the
shared error toast that stays until dismissed, and no inline line sits beside
the Save button.

Save is pressable with the timezone box empty. Pressing it then says what is
missing rather than the button quietly doing nothing, and the box is marked
`aria-invalid` so it is clear which one is at fault after the toast is gone.

The two help paragraphs that used to sit under the name and the timezone are
now the hint on each label (`ui/field-label.tsx`), which is where the repo's
UI rules put help text.

Account name, email, password and deletion stay with the shell's account
dialog; this tab never duplicates them.

Two more cards sit under this one on the same tab: **Your public page**, which
is [the public profile](public-profile.md), and the
[streak badge](streak-badge.md). They are separate cards because they are
separate decisions. The three fields above are about the account; those two
are each about one thing published on the open internet.
