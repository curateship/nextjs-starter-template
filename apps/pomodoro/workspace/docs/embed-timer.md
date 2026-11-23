# The timer inside Notion

`/embed/timer` is the timer made to sit inside a Notion page, or any page that
takes an embed. It shows the ring, the time, the phase, one Start or Pause
button, and a small "Open Flowfly" link in the corner that opens the full site
in a new tab. Tyler picked it on 7 Nov 2026.

## Putting it in Notion

1. In a Notion page, type `/embed` and pick Embed.
2. Paste the site's address with `/embed/timer` on the end, such as
   `https://<the site>/embed/timer`.
3. Drag the block's corner to size it. The ring shrinks to fit a short block.

## How it behaves

- **It is always a guest timer.** Tyler, 7 Nov 2026: guest only. Whoever is
  signed in on the full site, the embed runs like the signed-out front page,
  starting on the guest's default rhythm of 25 minutes on and 5 off.
- **Its focuses never reach Stats.** A browser keeps a page inside another
  site's page apart from the same site opened on its own, so the embed keeps
  its own count, in its own storage, and the account never hears of it.
- **The chime is always on.** The embed has no Settings to switch Completion
  alerts on from, so it plays the end chime itself. The first press of Start
  is what lets the browser make sound.
- **Space starts and pauses it**, as on the timer.
- **It is dark**, as the signed-out front page is.
- **Search engines are told to leave it out** (`noindex`), because it is a
  piece of another page.

## Switching it off

Tyler, 7 Nov 2026: "Add enable and disable notion timer in settings".

- **The switch is Settings → App settings → Notion timer**, "Show the timer
  inside Notion", at `/admin/settings/pomodoro-notion-timer`. It saves the
  moment it is flipped, like every Pomoder setting.
- **It starts on**, because the embed shipped working.
- **Off, every Notion page holding it shows one line**, "This timer is
  switched off for now.", and an "Open Flowfly" link to the full site. Nothing
  else on the site changes.
- **Flipping it reaches a Notion page on its next load.** A page already open
  keeps what it had, and the setting itself is held for five seconds on the
  server, like every other.
- **The page asks the server on every load** through `readEmbedTimerFn` in
  `src/lib/api/pomodoro/embed-timer.ts`, which anyone may call because nobody
  is signed in inside Notion. It answers that one true or false and nothing
  else.

## Framing

Pomoder sends no header that stops another site from framing its pages, on
any page, so the embed needs no exception. That is true of every Pomoder page,
not only this one; nothing in this feature changed it. Directory is the app
that does refuse frames (`apps/directory/workspace/docs/who-may-frame-cms.md`).
Adding the same refusal to Pomoder would have to leave `/embed/timer` open,
and would have to check first that the Personal app does not show Pomoder in
one of its panels.

## Where it lives

- `src/routes/embed.timer.tsx`: the address, outside the `_pomodoro` layout,
  so there is no left menu and no header.
- `src/components/pomodoro/embed-timer.tsx`: the page.
