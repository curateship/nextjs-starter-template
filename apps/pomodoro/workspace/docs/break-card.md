# The break card

While a break is on, a card under the timer says what the break is for and
lists a few things to do away from the screen. Tyler sent the two designs on
8 Oct 2026: "Add this box when a 5 minute break starts" and "this for 15
minute long break".

- **A short break** reads "Nice work! Take a 5 minute break from the screen",
  then "Stand up, stretch and give your eyes a rest.", then three steps: look
  at something 20 feet away for 20 seconds, roll your shoulders and stretch
  your neck, refill your water.
- **A long break** reads "Great session! Take 15 minutes to recharge", then
  "You finished all 4 sessions. Get up and move around properly.", then four
  steps: a short walk, a snack or a drink, a full-body stretch, and something
  that isn't a screen.
- **The numbers are the real ones.** The minutes are the break's own length
  and the sessions are your round's length, so a 10-minute short break says
  "Take a 10 minute break".
- **It shows for as long as the timer is on a break**, before Start is pressed
  as well as while it runs, and goes when the timer is back on Focus.
- **In a room it shows during the room's break**, with the host's break
  lengths. A room's round is always four sessions.
- **It runs the full width of the page**, the same as the cards under it.
  Tyler, 8 Oct 2026: "keeep the break box full width".
- **The ticks are yours and last one break.** Each step is a round tick that
  strikes the line through. Nothing is saved; the next break starts with
  every step unticked.
- **An admin can add a message and a theme for every break.** Tyler, 9 Oct
  2026: "Add a feature for admin to choose a theme that changes to it for
  break timer and an area for text so I can put some encourgement text or
  tips." Both are set on the Breaks tab under Settings → App settings (see
  [Admin settings](admin-settings.md)) and stored as `break.look`.
  - The message sits in its own box under the card's line, with the admin's
    line breaks kept. An empty message shows nothing.
  - The break theme replaces the page's backdrop for as long as a break card
    is on screen, on the timer or in a room. It goes back to the person's own
    theme when the break ends. On another page during a break, such as Tasks,
    the backdrop stays the person's own, because no break card is showing
    there. Zen mode follows the timer and shows it for the whole break.
  - The theme reaches the page with the rest of the room's media
    (`breakLook` in `MediaBootstrap`). A theme an admin later makes a Draft
    or deletes is dropped, and so is one made Pro for somebody without Pro.
    A break theme that will not load falls back to the person's own theme for
    the rest of the visit. The switching is `src/lib/pomodoro/break-look.ts`.
- **Where it lives:** `BreakCard` in `src/components/pomodoro/break-card.tsx`,
  drawn by `timer-dashboard.tsx` under the mode tabs and by `active-room.tsx`
  under the room's ring. The steps are the two lists at the top of that file.
