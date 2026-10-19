# Settings → App settings → Dating

One tab, listed in `src/app/options.ts`. It saves by itself: typing 700ms after the last key or when the field is left, a switch or a pick at once. The header says Saving…, Saved or Not saved. It is read once per page and held, so coming back to the tab draws at once.

| Setting | Default |
| --- | --- |
| About me: facts the AI may use about you | empty |
| Your example messages, up to five | empty |
| Style | Like my examples, no nudge |
| Looking for | empty |
| Dealbreakers | empty |
| Youngest and oldest | 18 and 99 |
| Like when the score is this or more | 70 |
| The AI sends its replies by itself | off |
| Soonest and latest reply, in minutes | 10 and 90 |
| Swipes an hour, messages an hour | 60 and 20 |
| Quiet from, quiet until | 1:00 and 7:00 |
| Monthly AI cap, in dollars | 20 |

- **A youngest age above the oldest**, or a soonest reply later than the latest, is refused with a toast and not saved.
- **Saved as one JSON object** per member per site in `date_settings`. A value that no longer passes its check takes its default, so one bad value never blanks the rest.
