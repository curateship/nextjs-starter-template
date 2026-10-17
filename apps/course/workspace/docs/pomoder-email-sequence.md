# The Pomoder email sequence

"Pomoder email sequence" is a flow in Automations that sends seven emails about
Pomoder, one every other day, to the people in one segment. It is saved switched
off with no segment picked. It starts sending when Tyler picks a segment on its
first step and switches it on.

How the two steps it is built from behave, for every app, is in the shell's
automations doc (`apps/shell/workspace/docs/automations/overview.md`,
"Sequences").

## What it sends, and when

Each person gets their own copy. Day 1 is the day their batch is let in.

| Day | Subject |
| ---: | --- |
| 1 | I built a timer that keeps you company |
| 3 | Why 25 minutes works |
| 5 | Working next to strangers |
| 7 | Rain, a café, or a forest? |
| 9 | Where did your week go? |
| 11 | Focus with your friends |
| 13 | Last one from me about Pomoder |

- **From "Tyler"**, with one orange button to `https://pomoder.com` in each.
- **Every email opens with "Hi,"**, not a first name. 24,460 of the 24,466
  reachable contacts in the local list have no first name, so "Hi
  {{firstName}}," would read "Hi ," for nearly everyone.
- **They sell what is free**: the timer, rooms, sounds and backgrounds, history
  and groups. Pomoder Pro cannot be bought yet.

## The flow

Segment, a few at a time → Email 1 → Wait 2 days → Email 2 → … → Wait 2 days →
Email 7. Every Wait has "Stop for anyone who clicked a link" on, so a click on
any of the buttons ends the sequence for that person.

## How long a list takes

The pace is Settings > Email's drip rules. At the defaults (400 to 500 people
every 30 to 60 minutes) with sending hours of 9am to 5pm, about 10 batches go a
day, roughly 4,500 people. A 9,000-person segment is all let in after 2 days,
and its last person gets Email 7 around day 15.

## Before switching it on

- **The wording must be final.** Each person keeps the version of the flow from
  the moment they were let in, so a fix to Email 5 on day 4 misses everyone
  already inside.
- **Set the sending hours in Settings > Email.** With none set, batches and
  wake-ups go at any hour, including 3am.
