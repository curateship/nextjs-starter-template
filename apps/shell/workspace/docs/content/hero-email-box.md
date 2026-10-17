# The hero's email box

A hero row can end in a button or in an email box. The box is one pill holding
a field and a button, and a visitor who types their address into it lands on
the register page with that address already filled in. Nothing is stored on the
way past: registering is what creates the person.

## The whole pill is the field

The pill is 448 by 58 pixels on a desktop. The field inside it used to be 285
by 20, which is 22% of something that reads as one control, and the rest was
dead: a click 8px in from the left edge, or 4px under the top edge, landed on
the form and did nothing at all. Somebody aiming at a field that looks 58 tall
had to hit a 20 pixel band through the middle of it.

The field is now the pill's full inner height and carries the left inset
itself, so it measures 305 by 56 and every pixel from the border to the button
is live. The text still starts 20px from the pill's edge, exactly where it has
always been, and the button keeps its 6px frame. Tyler asked for this on
5 October 2026.

If this ever needs changing again, the rule is that the padding belongs to the
field and not to the form around it. Padding on the form is space that looks
like the field and is not.

## The pill carries the focus ring

Focus used to draw nothing at all. Not a ring, not a border change, nothing:
`box-shadow: none` and `outline: none` on the focused pill, measured. A
keyboard had no way to say where it was, and a visitor who clicked the field
got no answer that the click had landed.

The pill now draws the same ring every other control in the app draws, through
`focus-within` rather than `focus-visible`. The reason is where focus lands:
the field inside the pill takes the focus, and the ring has to appear around
the pill around it. It is not taken from `focusRing` in
`src/lib/layout/focus-ring.ts` for that one reason, and it is the same three
declarations that constant holds.

A text field matches `focus-visible` whenever it is focused, mouse or keyboard,
so this draws on a click too. That is right for a text field: a click that
changes nothing on screen looks like a click that missed.
