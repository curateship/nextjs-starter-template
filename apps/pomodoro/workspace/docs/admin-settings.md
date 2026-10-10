# Admin settings

Pomoder's own admin settings are nine tabs under Settings → App settings, in
the rail on `/admin/settings`: Emergency switches, Themes and sounds, Seasons,
Breaks, New accounts, Rooms, Room chat, Pixabay and Made-up members. Each lives at
`/admin/settings/pomodoro-<name>` (the ids are `POMODORO_SETTINGS_TABS` in
`src/lib/pomodoro/app-settings.ts`), is listed in `settings.tabs` in
`src/app/options.ts`, and is drawn by `admin-settings-tabs.tsx`. Every save
writes one `pomodoro_audit_logs` row with the resource `settings`.

**Tyler's rule, 9 Oct 2026: "This settings page should be here and it has to
be auto save."** "Here" is the App settings card in the Settings rail. Until
that day the settings were a page of their own, `/admin/pomodoro-settings`, with
a Save button on every card. Tyler, the same day: "/admin/pomodoro-settings dont
need that route anymore", so the page and its route were deleted with no
redirect, and the "Pomoder settings" link under Settings in the left menu was
removed. The rule for every app is in `docs/shell/shell-and-apps.md`, "Where an
app's own Settings screen goes", and the UI standard's Settings section.

## How a tab saves

- **There is no Save button.** A switch or a pick saves the moment it changes.
  Typing saves 700ms after the last key, and at once when the field is left or
  Enter is pressed. Leaving the tab mid-typing still saves what was typed.
- **The page header says where the save stands**: Saving…, Saved, or Not saved
  with the reason. A refused save also says why in the error toast, and what was
  typed stays on screen.
- **A value that fails its check is not sent.** A season with no name, or two
  seasons sharing a day, reads "Not saved." under the list and in the header
  until it is fixed. So does a blocked word over 40 letters or a list over 300.
- **Clicking between the tabs shows no loading row.** The first Pomoder tab
  opened after a page load reads the settings and the Pixabay key's status
  once, with a loading row, and holds them (`held` in
  `admin-settings-tabs.tsx`). Every later open draws from that at once, the
  way the shell's own tabs draw from the record the shell layout holds. Each
  edit goes into the held copy before its save is sent and comes back out if
  the save is refused, so leaving a tab mid-edit and coming straight back
  still shows the edit. A later open also reads the server again quietly, but
  takes only the list of themes and sounds from it, so a theme made Live on
  another page reaches the pickers. A setting changed by another admin shows
  after a reload, the same as the shell's own settings.
- **Only removing the Pixabay key asks first.**

The settings live in `pomodoro_settings` (migration 0124), one row per setting,
each checked against its shape in `src/lib/pomodoro/app-settings.ts` on every read
and write. A missing row, or one that no longer fits, reads as the default, so
nothing changes until an admin saves. The server holds them for five seconds.

## Themes and sounds

- **Shuffle for guests and for members who haven't picked their own.** Tyler,
  8 Oct 2026. On, they get shuffle for both, from free items for a guest. Off,
  they get the defaults below. It starts on: Tyler, 9 Oct 2026, "shuffle is on
  automatically for all users until they choose a song or theme." A site where
  an admin already saved it off keeps it off. "Haven't picked" means the personal room's sound
  or theme is still empty; a member who chose silence saved `none` and keeps it.
- **Default sound and default theme**, from free Live items only, because guests
  get them too. With none set, a guest gets a random free pair as before, and a
  member who never picked gets silence and Lofi girl.
- **The default theme is also the fallback** for anybody whose theme was made a
  Draft or deleted. Lofi girl stays the last fallback, because its files ship
  with the app.
- **Suggest a name and tags with AI**, on the Member uploads card. On, the
  upload window asks Claude Haiku 4.5 for a name and two or three tags from
  each file's name. It starts on and needs the Anthropic key in Settings → AI.
  Off, the window keeps the file name and no tags. See [Your own backgrounds and
  sounds](own-media-uploads.md#ai-fills-in-the-name).

## Seasons

A sound and theme that replace the defaults between two dates, such as a snow
scene through December. Two seasons may not share a day, and the page says which
two clash. Members who picked their own are not touched. Today is the server's
UTC day, near enough for a season measured in weeks.

## Breaks

A break theme and a break message, shown to everybody while a short or long
break is on. Both start empty, which changes nothing. See
[The break card](break-card.md) for what people see.

- **The break theme** is a free, Live theme, because guests take breaks too.
  "None" leaves everybody's own theme alone.
- **The break message** is up to 600 characters. Typing saves the same way as
  every other box. Over 600 reads "Not saved." under the box and is not sent.

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

## Pixabay

The API key "Import from Pixabay" uses on the Themes page to copy pictures and
films (see [Themes and sounds in the admin](catalog-admin.md)). A free key
comes with a Pixabay account at pixabay.com/api/docs. Music links need no key,
because nothing is fetched for a sound.

- **The key never reaches the browser.** It is one `pomodoro_settings` row,
  `pixabay.apiKey`, scrambled with the shell's secret encryption before it is
  stored, and kept off the list of settings the other tabs load, which goes to
  the browser whole (`src/server/pomodoro/pixabay-key.ts`). The Pixabay tab
  asks the server on its own and hears back only whether a key is saved and
  its last four characters. Anything that ever exports or lists
  `pomodoro_settings` rows must leave this one out.
- **Pasting a key saves it** once it looks like one: 10 to 100 characters with
  no spaces. Anything shorter is not sent, and leaving the field says what is
  wrong. Remove asks first; links still waiting are then refused with "No
  readable Pixabay API key is saved". Both write a `settings` audit row.
- **A key that can no longer be unscrambled**, because the server's
  `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY` changed, shows a line saying to paste it
  again. With that setting missing, Save says "Secret storage is not set up"
  and stores nothing.

## Made-up members

How many made-up members there should be, the most hours any of them focuses
in a day, and a switch that pauses them, plus the Make them now and Remove all
buttons. Flipping the pause writes a `simulated_pause` audit row with the
resource `simulated` instead of a `settings` one. Everything else about them
is in [Made-up members](made-up-members.md).
