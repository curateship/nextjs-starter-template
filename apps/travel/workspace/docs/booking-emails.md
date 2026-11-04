# Paste a booking email

The "Paste a booking" window turns a confirmation email into a new activity
(task part 44). The person pastes the email and presses Read email. AI fills
in the activity, and the window shows it to be checked and changed. Nothing is
saved until Create activity.

## What the AI fills in

- **The name, the type, the day, the start time, the nights, the place and
  address, and the cost.** Bookings were removed on 2 Nov 2026, so a
  confirmation number isn't kept.
- **The type is one of the person's own six starting types**: Flight, Hotel,
  Food, Sight, Transport or Other, whatever they have renamed them to. A
  person who removed the type the AI picked gets no type.
- **The day comes from the email's date and the trip's start date.** A date
  off the trip, or a trip with no dates yet, puts the activity in Ideas, and
  the window says which date the email gave.
- **Nights are kept for a hotel only.**
- **A price is copied only in the trip's money.** A $120 price on a trip kept
  in yen isn't copied, because it would add the wrong number to the trip's
  total. The window says what the email's price was.
- **A field the AI gets wrong is left empty** rather than failing the whole
  email. An answer with no name at all, or that isn't the JSON asked for,
  gives "The booking email couldn't be read."
- **Create activity** makes the activity on its day, then saves the place,
  nights and cost. The new activity opens in the right panel.

## The AI call

- **It uses the shell's metered AI call** (`runAiCall`), so the person's
  monthly AI allowance is checked first and the cost is written down after.
  The first text provider with a key in Settings → AI does the work.
- **No AI key means no reading.** The window says AI isn't set up and to add
  a key in Settings → AI. The AI key only goes on the live site at launch, so
  until then this works locally only.
- **At most 20,000 characters of email go to the AI.** A booking is near the
  top of an email, and the cap keeps the cost down.
- **The answer is checked after the call is written down**, so a muddled
  answer still counts as the call it was.

The code is `src/server/travel/booking-email.ts`, and the AI call it shares
with [Drafting a plan](drafting-a-plan.md) is `src/server/travel/ai.ts`. The window is
`src/components/travel/paste-booking-dialog.tsx`.
