# Settings → App settings → Dating

One tab, listed in `src/app/options.ts`. It saves by itself: typing 700ms after the last key or when the field is left, a switch or a pick at once. The header says Saving…, Saved or Not saved. It is read once per page and held, so coming back to the tab draws at once.

| Setting | Default |
| --- | --- |
| About me: facts the AI may use about you | empty |
| Your example messages, up to five | empty |
| Also learn from my last 10 sent messages | on |
| Style | Like my examples, no nudge |
| Looking for | empty |
| Dealbreakers | empty |
| Youngest and oldest | 18 and 99 |
| Furthest away, in km, copied into Tinder with the ages | 25 |
| People I know, one "Sarah, 31" a line | empty |
| Like when the score is this or more | 70 |
| Swipe every day from, until | no schedule |
| The AI sends its replies by itself | off |
| Soonest and latest reply, in minutes | 10 and 90 |
| Swipes an hour, swipes a day, messages an hour | 60, 150 and 20 |
| Quiet from, quiet until | 1:00 and 7:00 |
| Monthly AI cap, in dollars | 20 |

- **A youngest age above the oldest**, or a soonest reply later than the latest, is refused with a toast and not saved. So is a schedule that starts and ends at the same hour.
- **The schedule's two hours go together.** Picking one when neither is set fills the other three hours away; No schedule on either clears both.
- **A People I know line that is not a name and an age** is marked and named in a toast when the box is left, and the list is not saved until it reads.
- **Changing the distance or an age** has the phone set Tinder's own filters to match on its next free pass (`ai/swiping-and-scoring.md`).
- **Google Calendar** is a card of its own at the bottom: Connect, or Disconnect after a confirm. It is a connection, not a saved value; `chats/dates-and-calendar.md` explains it.
- **Saved as one JSON object** per member per site in `date_settings`. A value that no longer passes its check takes its default, so one bad value never blanks the rest.
