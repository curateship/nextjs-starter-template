# Completion chimes

The sound when a phase ends, picked separately for a focus ending and for a
break ending, because the two moments mean opposite things: stop working, and
start again. Both start on the original two-tone chime, so nobody hears
anything new until they choose.

## Picking

Settings → Timer, under Completion alerts: "When a focus ends" and "When a
break ends", each a picker with a Preview button and a one-line description
of the chosen sound.

- **Five choices:** Two-tone (the original), Soft gong, Bright ding, Rising,
  and Silent. Silent plays nothing; the desktop notification still appears if
  the browser allows it.
- **Preview plays with alerts off and no timer running.** The press is the
  gesture a browser needs before it makes any sound. Silent has no Preview.
- **The chimes play only while Completion alerts is ticked**, and the card
  says so while it is not.
- **Saved as soon as it is picked**, like the Completion alerts box above it:
  to the account (`user_preferences.focus_chime` and `break_chime`, migration
  `0121`) when signed in, and in the browser for a guest. A value the app no
  longer knows reads as Two-tone rather than failing.

## How they sound

Every chime is drawn by the browser from a few tones, the way the original
always was, so there is no file to fetch and nothing that can fail to load at
the moment it matters. The tones, pitches and fade lengths are in
`src/lib/pomodoro/chimes.ts`; playing them, and which moment gets which, is
`fireCompletionAlert` and `previewChime` in
`src/lib/pomodoro/completion-alerts.ts`. The picker is
`src/components/pomodoro/completion-chime-fields.tsx`.
