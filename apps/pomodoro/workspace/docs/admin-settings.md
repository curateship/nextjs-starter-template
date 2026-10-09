# Admin settings

The Pomoder settings page, `/admin/pomodoro-settings`, holds the app's own admin
settings, one card per group, each saving on its own. Every save writes one
`pomodoro_audit_logs` row with the resource `settings`.

The settings live in `pomodoro_settings` (migration 0124), one row per setting,
each checked against its shape in `src/lib/pomodoro/app-settings.ts` on every read
and write. A missing row, or one that no longer fits, reads as the default, so
nothing changes until an admin saves. The server holds them for five seconds.

## Themes and sounds

- **Shuffle for guests and for members who haven't picked their own.** Tyler,
  8 Oct 2026. On, they get shuffle for both, from free items for a guest. Off,
  they get the defaults below. "Haven't picked" means the personal room's sound
  or theme is still empty; a member who chose silence saved `none` and keeps it.
- **Default sound and default theme**, from free Live items only, because guests
  get them too. With none set, a guest gets a random free pair as before, and a
  member who never picked gets silence and Lofi girl.
- **The default theme is also the fallback** for anybody whose theme was made a
  Draft or deleted. Lofi girl stays the last fallback, because its files ship
  with the app.

## Seasons

A sound and theme that replace the defaults between two dates, such as a snow
scene through December. Two seasons may not share a day, and the page says which
two clash. Members who picked their own are not touched. Today is the server's
UTC day, near enough for a season measured in weeks.

## Rooms

People in one room (off means no limit), weekly rooms per host (5) and
invitations per room (20). See [Rooms in the admin](rooms-admin.md).

## Room chat and the emergency switches

Blocked words (held or starred), chat speed (20 a minute), Pause new rooms and
Pause all chat. See [Admin safety tools](admin-safety-tools.md).

## New accounts

The focus, short break and long break lengths, the sessions before a long break,
and the daily goal a new account starts with. Only accounts made after the save
start there (`loadOrCreatePreferences`), and guests who have not changed their
own timer. Existing members keep their settings.

A guest's page draws the code's 25 minutes on its very first frame and then the
admin's numbers once the timer reads its state, because the timer's first frame
comes from the code rather than the page's data.
