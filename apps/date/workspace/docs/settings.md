# The Dating settings

The ⋮ in the Dating dashboard's left header holds these, as tabs of the design's dropdown (Tyler, 18 Nov 2026: "THe left panel cog needs to be changed to a 3 dot dropdown and the modal needs to be a dropdown with the new dropdown ui"). Until then a cog opened them in a window (Tyler, 20 Oct 2026: "all the settings needs to be in this cog modal"). They are nowhere else: they left Settings → App settings on 20 Oct 2026, because "we're gonna build a Profiles dashboard so all the settings will be differfent depending on the profile". Coming back from Google Calendar's screen opens the ⋮ at General and says how it went.

Every setting belongs to one profile (`profiles.md`): the ⋮ is the open profile's. A new profile starts with a copy of the open one's settings.

- **General**: Cover photo (the page's), **Open profile** (switches profile), the profile's **Name** and **Google Calendar**; then **New profile**, **Pause profile** or **Resume profile**, **Delete profile** in red, and **Lock blocks** at the foot.
- **You**: About you (About me, Example messages, Learn from my last 10 sends, Style) and Who you are looking for (Looking for, Dealbreakers, Ages, Furthest away, People I know).
- **Rules**: Swiping (Like at, Swipe every day from, Until), Replies (The AI sends replies by itself, Reply after), Limits (Swipes an hour, Swipes a day, Messages an hour, Quiet from, Quiet until) and AI spend (Monthly cap).
- **Widgets**: Overview's rows and spots (`dating-dashboard.md`).

Each field is a row: its name on the left, its value on the right. A short list of choices drops from the row and a pick saves at once. A typed value opens a small box under the row; Escape closes the box and leaves the menu open. A switch is the row's own.

The rows are `src/components/dating/dating-settings.tsx`. They save by themselves: typing 700ms after the last key or when the box closes, a switch or a pick at once. The page header says Saving…, Saved or Not saved. They are read once per page and held for the profile they belong to, so moving between the tabs draws at once.

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

- **A youngest age above the oldest**, or a soonest reply later than the latest, is refused with a toast and not saved. So is a schedule that starts and ends at the same hour, and one that shares an hour with another profile's on the same phone.
- **The schedule's two hours go together.** Picking one when neither is set fills the other three hours away; No schedule on either clears both.
- **A People I know line that is not a name and an age** is marked and named in a toast when the box is left, and the list is not saved until it reads.
- **Changing the distance or an age** has the phone set Tinder's own filters to match on its next free pass (`ai/swiping-and-scoring.md`).
- **Google Calendar** is a row of General: Connect, or, once connected, a box with who it is connected as and **Disconnect**, after a confirm, for this profile only. It is a connection, not a saved value; `chats/dates-and-calendar.md` explains it.
- **Saved as one JSON object** per profile in `date_settings`, keyed by `account_id`. A value that no longer passes its check takes its default, so one bad value never blanks the rest.
