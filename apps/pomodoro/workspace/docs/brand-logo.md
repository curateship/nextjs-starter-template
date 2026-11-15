# The Flowfly logo

The logo is the word "flowfly" with a small firefly drifting at its top right.
The firefly's tail is a teal glow. One component draws it,
`src/components/pomodoro/flowfly/flowfly-logo.tsx`, and the movement lives in
`src/components/pomodoro/theme.css` under the `flowfly-` names.

## What Tyler chose

Each part is his pick, made on 15 Nov 2026 from sketches on a private page.

- **The idea.** "rebuild the logo thats whimsicle and animated", then, of
  three sketches, "i like idea 3": the name with a light beside it.
- **The light.** "Make it green and make the dot and glow as one blob. Make
  the dot move around in the top right and a random sort of movemment". The
  glow is one circle, solid green in the middle and fading to nothing at its
  edge.
- **The colour.** The glow began green and is now teal: "can you make the
  color more teal instead of green". Only the firefly's glow changed. The
  timer ring's running bar is still the app's green.
- **The firefly.** "add the firefly to the green blob", then "the white part
  is too bright. make it dark gray", then "the green blod should go over the
  firefly so we see less of it". The glow is drawn on top of the body, so
  only the head and the wing tips show.
- **The letters.** "something more hand written but clean", then Grandstander
  out of 26 fonts, then "the body of the font is too thick. make it thinner"
  and the pick "L1", which is Grandstander Bold, weight 700.

## How it is drawn

- **The letters are shapes, not text.** The outlines were taken from
  Grandstander Bold once and pasted into the component, so the app loads no
  font for the logo. Grandstander is under the SIL Open Font License, which
  allows a logo.
- **Two versions.** `variant="word"` is the whole name. `variant="letter"` is
  the f with the same firefly, for a square space.
- **The letters take the page's text colour**, so they are dark on the light
  theme and light on every dark shade.
- **The firefly's colours** are set on `.flowfly-logo` in `theme.css`. Light
  theme: a `#29241f` body and a `#12a595` glow. Dark theme: a `#55555e` body
  and a `#2ee6cb` glow.

## How it moves

- **The drift.** Three movements run on clocks of 7.3, 5.1 and 3.3 seconds
  and add together, so the path does not look like a loop. It is not truly
  random. The firefly wanders about 9 units either side of its resting spot
  in the word, and 55% of that beside the f.
- **The glow** swells and dims every 2.1 seconds. The wings flick every 0.16
  seconds.
- **Reduce motion.** With the device's "reduce motion" setting on, the logo
  holds still with the firefly at its resting spot.

## Where it shows

- **The left menu**: the word, 36px tall. Narrowed to icons, the menu shows
  the f, 36px square.
  The f's left edge sits on the nav icons' left edge, 28px from the menu's
  side (Tyler, 15 Nov 2026: "moev the logo so that it aligns with the icons
  in the bottom"). Narrowed, the lone f sits over the middle of the icons.
- **The header**: the word, 32px tall, only between 640px and 1024px wide,
  where the left menu is a drawer. From 1024px the menu is open beside the
  header, and a second logo there was removed (Tyler, 15 Nov 2026: "remove
  this one"). Under 640px the header has no room, and the drawer has the logo.
- **Every timer ring**: on `/timer`, in Zen mode, in a room, in the floating
  timer and in the Notion timer, the firefly rides the end of the bar
  (Tyler, 15 Nov 2026: "add the firefly floating around the ring when it
  starts and follow the green bar"). Its glow sits on the bar's end, its head
  points the way the end is travelling, and it wobbles up to about 6px around
  that spot. The glow is teal while the timer runs and the bar's orange while
  it is paused or not started (Tyler: "keep the firefly orange when its pause
  or not started yet"). The glow fades between the two over half a second
  (Tyler: "create a transition animation from orange to green and vice
  versa"). When the timer starts, the firefly also does one
  back flip, a nose-up loop out from the ring and back in 0.9 seconds (Tyler:
  "when it turns green or orange, the firefly makes a fly back flip
  maneuver", then "actually dont make it flip from green to orange"). It does
  not flip on pause, when the page first draws, or with reduce motion on.
  `RingFirefly` in the logo's file draws it, sized
  to each ring. In a room the glow is teal during the focus and orange on a
  break or while the room waits, the same rule the room's bar follows.
- **The tab icon and the phone's home-screen icon**: the f with the firefly,
  still, on a rounded tile in the light canvas colour `#f3efe8`. The tile is
  there because a dark f on a clear background vanishes on a dark tab bar.
  An icon uploaded in Settings → Branding still wins over these two files.

## The fireflies on a finished task

Ticking a task releases six small glows in the logo's teal from the tick box.
[Tasks](tasks.md) has the rules. The glows are plain circles, with no body or
wings, because at 9 to 15px across nothing else would show.

## Not built yet

The task in `workspace/tasks/marketing/01-animated-logo.md` also asks for a
focusing and a done version, the logo while pages load and when a focus ends,
a single SVG file for the shell's uploader, and video clips. None of those
exist yet. The tomato the logo replaced is gone from the app's code.
