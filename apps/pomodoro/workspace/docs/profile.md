# Profile

The product's Settings page (`/settings`, card
`src/components/pomodoro/profile-settings-panel.tsx`) holds the three
app-level facts about a person, in `pomodoro_profiles` (migration
`0085_pomodoro_profiles.sql`):

- **Public display name** (up to 50 characters, may be empty) — the only
  name other users ever see, on the leaderboard and in rooms.
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

Account name, email, password and deletion stay with the shell's account
dialog; this tab never duplicates them.
