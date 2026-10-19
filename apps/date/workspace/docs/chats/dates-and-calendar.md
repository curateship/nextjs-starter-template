# Dates and the calendar

What happens once someone says yes to the drink or coffee the AI offered. Built 18 Oct 2026 from `../../tasks/features/01-chats-and-replies.md`.

Tyler's rule from 17 Oct 2026 holds throughout: the AI never agrees a firm time or place. Only the member sets them.

## Noticing a yes

The AI's notes call after new messages (`chats-and-replies.md`) also asks whether the member offered to meet and whether they clearly said yes. The offer counts whether the AI's draft made it or the member did in their own words. A maybe, a question back or a change of subject is not a yes. A yes keeps their line and the time it was noticed.

- **Their number** is kept when they sent one in the chat. A number counts only when its digits are in one of their own messages, so the AI can never make one up or hand back the member's own.
- **The Dates tab**, beside Profiles and Matches, lists every yes, newest first, with the time and place once set, and their number.

## Before your date

A card at the top of the right column on a chat with a yes: their line, their photos, when and where, their number, three lines from the chat worth remembering, and what they told you. The three lines come from one small AI call, made once when the yes is noticed. If that call fails, it is not tried again; the card shows everything else. **Add to calendar** opens the window that sets the time.

## Add to calendar

A window with the day, the time and the place, typed by the member. Clear the time takes the place with it. A sample says nothing was saved.

## The Calendar screen

`/admin/dating/calendar`, under Dating in the left menu, after Phone (`drizzle/0100_date_chats.sql` adds the link). A month with the days that have a date underlined, the dates of the month shown beside it, the yeses still waiting for a time, and whether Google Calendar is connected. A date opens its chat on the dashboard's Dates tab.

## Google Calendar

Optional, in Settings → Dating → Google Calendar. One way only, as Tyler chose: Date adds, moves and removes its own event for each date with a time, and never reads the calendar.

- **The event** is "Date with Noor", at the place, two hours long, described "Added by Date."
- **Connect** goes to Google and back. It asks only for the permission to manage calendar events, and keeps a refresh token encrypted with the server's key. `state` and a PKCE secret in a ten-minute cookie stop anyone else's link from connecting their calendar to this account.
- **Disconnect** asks first, forgets the token and asks Google to cancel the access. Events already written stay in the calendar.
- **A Google failure never loses the date.** The date is saved in Date first; the toast says "Saved in Date, but not in Google Calendar" with Google's reason, and the card shows the last refusal.
- **It needs setting up on the server.** It uses the same Google app as Continue with Google (`CUSTOM_SHELL_GOOGLE_CLIENT_ID` and `CUSTOM_SHELL_GOOGLE_CLIENT_SECRET`). That app needs the Google Calendar API switched on and `/api/dating/google-calendar/callback` listed as a redirect address. Neither key is set locally, so the card says "Not set up on this server yet" there.

## Where it lives

- `src/server/dating/google-calendar.ts`, and the two addresses `src/routes/api/dating/google-calendar.ts` and `google-calendar_.callback.ts`, which check the session themselves because the guard test does not walk them.
- `setDatePlan` and `agreedDates` in `src/server/dating/chats.ts`; the window is `src/components/dating/date-plan-dialog.tsx`; the screen is `src/components/dating/dating-calendar.tsx`.
