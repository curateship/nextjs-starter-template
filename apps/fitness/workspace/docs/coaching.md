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

## What a linked coach can do

- Click the client on the Clients table. That opens the client's Programs dashboard (`/programs?person=<client>`), with "You're looking at <name>'s programs" at the top and a link back to their own. From there each program opens its own dashboard.
- Make programs for the client with New program, and change the client's programs and weeks. A program a coach made says "Built by <coach>" under its name.
- Build a client's week with AI. The AI cost is the coach's, counted against the coach's own allowance.
- Not share a client's program as a public page. Sharing is the owner's alone.
- Read the client's workouts, records and charts. A coach can't log, change, finish or delete a client's workouts; those stay the client's own.
- See the client's before and after photos only after the client switches that on for that coach under My coaches on their Programs dashboard. It is off until then.

Every one of these is checked on the server, on every request (`canReachPerson` in `src/server/fitness/access.ts` and `canSeePhotos` in `src/server/fitness/photos.ts`). A request still waiting for an answer grants nothing.

## Ending it

- The client presses Remove beside the coach under My coaches.
- The coach presses the bin beside the client on the Clients table, or ticks several clients and presses Remove. The Clients table sorts by name or status like every other table.
- Both ask first. Access stops on the next request; the client's own records stay with the client.

## Not built

Payments between coach and client, and chat. The task file leaves both out.
