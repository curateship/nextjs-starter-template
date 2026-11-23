# Coaching

A coach builds programs for clients and reads what they logged. A client can end it at any time, and the coach loses access straight away.

## Who is a coach

A coach is an account with the app's Coach role (`roles` in `src/app/options.ts`). The site admin makes one on Admin, Users. A coach lands on the Programs dashboard after signing in and trains like anyone else. Their clients are a second table, Clients, under their own programs.

## Asking a client

- The coach presses Invite client on the Clients table and types the email on the client's account.
- The client must already have an account. An email with no account, a coach's email, or the coach's own email is refused with a plain sentence.
- A coach can send at most 20 invites an hour.
- The client gets a notice in the bell, "<coach> wants to coach you", and a Coach requests card appears at the top of their Programs dashboard with Accept and Decline.
- Until Accept, the coach sees the client as "Waiting for an answer" and can't open anything. Decline removes the request.

## The Clients table

Tyler, 21 Oct 2026, picked the columns "Last workout, This week vs goal, Missed this week, Latest check-in". For each client who said yes the table shows:

- **Last workout:** "Push, 2 days ago", or "Nothing yet".
- **This week:** finished workouts against the weekly goal, "2 of 3", counted the same way as the client's own: every program, Monday to Sunday on the client's clock, the goal lowered by a day skipped on purpose.
- **Missed:** planned workouts earlier this week in the client's active program that nobody logged or skipped.
- **Last check-in:** the day of the client's last weekly check-in, marked New until the coach opens their check-ins (`weekly-check-in.md`).

Every column sorts. The figures for every client load in a fixed handful of queries, never one per client (`clientOverviews` in `src/server/fitness/coach.ts`). A request still waiting shows none.

## The notice after two misses

Tyler, 21 Oct 2026: "After 2 misses in a row". Once a client misses two planned workouts in a row in their active program, each of their coaches gets one bell notice, "Anna missed Push and Pull in a row", which opens the client's Programs dashboard. One notice per run of misses: every missed date in the run is stamped when it goes out (`coach_noticed_at`), so a third miss sends nothing more. A finished date ends the run. A skipped date is passed over, since a skip is neither done nor missed: missed Monday, skipped Wednesday and missed Friday is two in a row. Dates before the program's start day don't count, so the end of one "Run it again" doesn't join the start of the next. A run reaches back to the last finished workout however long ago, and each later miss in a run already told is stamped too, so a run of any length sends one notice. It goes out at the reminder time on the client's own clock, during no pause, to the bell only, and needs no switch (`runCoachMissNotices` in `src/server/fitness/reminders.ts`).

## Copy a program to a client

"Copy to a client", in the three dots on a coach's own program, copies it into the account of a client who said yes, in one step. Tyler, 21 Oct 2026: "Start from the client's best lifts".

- **What goes:** the name, routine type, week, weight rules, training blocks, step-up rules and length. Pictures, starting data and history stay behind. The copy reads "Built by Cleo" and isn't the client's active program unless it's their first.
- **Weights:** each heavy lift starts at 75 out of 100 of the client's best lift in their active program's starting data, the way templates start, rounded to the plates. A lift the client gave no best lift for starts empty.
- **A coach's own lift** lives in the coach's library, so it's left out, and the message names it: "Copied to Anna's programs. Left out Cable fly, which is yours."
- The week is copied by the same code that copies a shared program (`copyWeek` in `src/server/fitness/sharing.ts`).

## What a linked coach can do

- Click the client on the Clients table. That opens the client's Programs dashboard (`/programs?person=<client>`), with "You're looking at <name>'s programs" at the top and a link back to their own. From there each program opens its own dashboard.
- Make programs for the client with New program, and change the client's programs and weeks. A program a coach made says "Built by <coach>" under its name.
- Build a client's week with AI. The AI cost is the coach's, counted against the coach's own allowance.
- Not share a client's program as a public page. Sharing is the owner's alone.
- Read the client's workouts, records and charts. A coach can't log, change, finish or delete a client's workouts; those stay the client's own.
- Leave notes on a client's finished workouts and their lifts (`coach-notes.md`), and read their weekly check-ins (`weekly-check-in.md`).
- See the client's before and after photos only after the client switches that on for that coach under My coaches on their Programs dashboard. It is off until then.

Every one of these is checked on the server, on every request (`canReachPerson` in `src/server/fitness/access.ts` and `canSeePhotos` in `src/server/fitness/photos.ts`). A request still waiting for an answer grants nothing.

## Ending it

- The client presses Remove beside the coach under My coaches.
- The coach presses the bin beside the client on the Clients table, or ticks several clients and presses Remove. The Clients table sorts by name or status like every other table.
- Both ask first. Access stops on the next request; the client's own records stay with the client.

## Not built

Payments between coach and client, and chat. The task file leaves both out. Coach notes go one way, so they aren't chat.
