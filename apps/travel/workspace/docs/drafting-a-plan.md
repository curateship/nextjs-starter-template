# Drafting a plan with AI

AI can write a trip's first plan: 3 to 5 sights and meals on each day, with
start times and lengths, for the trip's destination (Tyler, 3 Nov 2026:
"Sights and food, timed"). Nothing is saved until the plan has been checked.

## Where it starts

Both ways Tyler picked ("Both"):

- **New trip** has a tick box, "Fill it with a first plan, drafted by AI".
  The trip is made as usual and opens with the Draft a plan window already
  asking. A ticked box needs a destination, and New trip says so before
  making the trip.
- **"+ Add" → Draft a plan** on any trip opens the same window.

## What it plans

- **Only empty days.** A day with any card on it is left alone, so a draft
  never adds to or removes anything already planned. The window names the
  days it left, such as "Days 2 and 4 already have plans".
- **14 days at a time.** A longer trip gets its first 14 empty days, and the
  window says how many are left to draft again after these are added.
- **What the AI is told:** the destination, the trip's length, and each day
  to plan with its date when the trip has one, so it can mind what is shut on
  which weekday. It answers with each place's own name, as Google Maps knows
  it, a kind (sight, food, transport or other), a start time and how long to
  spend there.
- **What is kept:** only the days asked for, at most 5 cards a day. A card
  with no name is dropped, and a time, length or kind the AI got wrong is
  left empty or made Other, rather than failing the plan. An answer with no
  usable plan at all says "The AI didn't send back a plan it could use".
- **Types** are the person's own Sight, Food, Transport and Other, whatever
  they renamed them to. One they removed gives no type.

## Checking it

The window lists the plan day by day. Each card can be unticked, renamed or
given another start time. "Create 12 activities" makes the ticked ones, each
after whatever its day already holds. Closing the window after a change asks
first, and nothing is saved.

## Places from Google

With `GOOGLE_MAPS_API_KEY` set, each card made is searched on Google as
"name, destination", and the first real place is saved with its address,
map position, opening hours, website and phone. The toast says how many were
found, such as "Google found 16 of 18 places". One Google can't find keeps its
name alone. Four are looked up at once. Without the key the cards are made
with their names only.

## The AI call and its cost

- **The shell's metered AI call** (`runAiCall`), named "travel-trip-draft" in
  the AI usage list, so the person's monthly allowance is checked first and
  the cost is written down after. The first text provider with a key in
  Settings → AI does the work.
- **The answer is capped** at enough for 14 days of 5 cards, so one draft
  can't run up a large bill.
- **Works locally only until launch.** The AI key goes on the live site at
  launch, never on a deploy, so until then the window says AI isn't set up.
- **The AI can name a place that doesn't exist.** That's why each one is
  checked against Google when the key is set, and why everything is shown to
  check first.
- **One person can draft or make 20 plans in 10 minutes**, since one plan can
  look up 70 places on Google.

## Where it lives

`src/server/travel/trip-draft.ts` drafts and makes the plan, through
`src/server/travel/ai.ts`, the AI call it shares with
[Booking emails](booking-emails.md). The window is
`src/components/travel/draft-plan-dialog.tsx`; the tick box is in
`new-trip-dialog.tsx`.
