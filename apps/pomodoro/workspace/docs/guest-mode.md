# Guest mode and the one-time import

The whole product works without an account: timer, tasks, settings, sound,
background, theme and presets all save in the browser. The `_pomodoro`
layout admits guests (it only forwards to `/login` for pages that truly
need an account, like History's data), and the product header shows Log in
/ Register instead of the account actions.

## How it is wired

- **One fact, set once:** the layout tells
  `src/lib/pomodoro/auth-state.ts` whether the visitor is signed in, and
  every engine (timer, sound, background) reads it instead of calling the
  server and getting a 401.
- **Guest storage** (`src/lib/pomodoro/guest-storage.ts`) wraps every read
  and write, so blocked storage (private windows, cleared site data) never
  breaks the page — it just means a fresh start. Keys:
  `pomodoro:guest:v1` (timer + tasks + rhythm), `pomodoro:sound:v1`,
  `pomodoro:background:v1`, `pomodoro:presets:v1`.
- **The timer engine's guest branch** mirrors the old app: state restores
  on load (a running countdown resumes from its wall-clock end), a
  finished focus bumps today's count and the picked task locally, and the
  day resets at the browser's midnight. Ticks are never written to
  storage.
- **Premium stays locked for guests** (sounds, scenes), and guests keep
  curated scenes only — they never own uploads.

## The import

The first signed-in visit after working as a guest copies the guest's
tasks and timer settings to the account
(`maybeImportGuestState` in `src/lib/pomodoro/guest-import.ts`, endpoint
`importGuestState` in `src/lib/api/pomodoro/productivity.ts`). The server
does it exactly once — `guest_imported_at` on the profile row (migration
0088), checked under a row lock — so a second sign-in, a double call or
freshly planted guest data imports nothing. The browser copy is cleared
after the call, exactly as the old app's login did.
