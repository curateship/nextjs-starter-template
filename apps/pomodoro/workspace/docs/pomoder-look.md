# The Pomoder look

The member-facing screens of this app draw in the old pomoder app's look:
near-black warm dark surfaces, a matching cream light mode, the orange #ff5a3c
accent, and the Bricolage Grotesque and JetBrains Mono fonts — the stage for
the old app's product UI with its own sidebar and the timer ring. The admin
and shell screens keep the standard shell look.

Two rules from Tyler govern this, in his words: "Need tasks to copy the
frontend so that it looks exactly like the old pomoder app", and, correcting
task 01 on 24 Sep 2026, "The task is actually wrong. It's supposed to set the
stage for the frontend, not the backend" — frontend meaning the member
screens (dashboard, rooms, sounds, tasks and the rest), not the admin.

## The name and the tab icon

People see the app called Pomoder: "pomoder." in the left menu and the phone
header, the front page and Plans titles, the end-of-focus notification and the
share picture. Tyler's words: "Change the name to Pomoder. Favicon is not
wired on the frontend." He chose only what people see, so the folder, the web
addresses, the port entry and every code name stay `pomodoro`.

The tab icon is the tomato with clock hands from the left menu (`TomatoMark`
in `pomodoro-shell.tsx`), saved as `public/favicon.ico` (16, 32 and 48px) and
`public/apple-touch-icon.png` (180px on the light canvas colour). Browsers ask
for both addresses on their own, so no shell file links them. An icon an admin
uploads in the branding settings still wins, because the root route writes its
links into the page. The other page titles read the app name saved in those
same settings, which falls back to "Custom Shell" until it is set to Pomoder.

## Every button is round and bold

Every shared `Button` on a member screen is a pill with bold text. The shape
comes from one rule in `theme.css`, on `[data-slot="button"]` under the same
`:has([data-pomodoro-screen])` gate as the tokens, so no call site writes
`rounded-full` or `font-bold`. Before, 44 calls pasted those classes and the
rest forgot, so square buttons sat next to round ones.

- **Why the theme and not the button.** `src/components/ui/button.tsx` is a
  shell file, and an app may never edit one. The rest of the Pomoder look
  already switches on from `theme.css`, so the shape joins it there and no
  shell file is touched.
- **It reaches dialogs and popovers**, because the gate is on the page root
  and those layers are portaled under it.
- **Raw `<button>`s are not touched.** The header's quick-control pills, the
  sidebar rows and the popover's preset rows draw their own shape on purpose.
- **The rule is unlayered**, so it wins over the button's own `rounded-lg`
  and `font-medium`. A member-screen button cannot be made square from a call
  site, which is the point.

## Lines and tints come from the theme

Every divider and frame line on a member screen is a plain `border`,
`border-t`, `border-b` or `border-r` with no colour class, so it takes
`--border` and moves with the Divider lines setting. That covers the timer
card and its header, the goal row, the add-task row, the left menu's edge and
its saved-links divider, the header's quick-control pills, the session-note
box, the theme switch, the zen-mode leave button and the empty Rooms box.
They used to be written as `rgba(var(--p-fg-rgb), …)`, which looked right at
the default and then never moved.

An orange tint uses `primary` at the same strength rather than a pasted
`rgba(255,90,60,…)`, so the colour is unchanged: `--primary` is `--p-accent`
on these screens. The selected left-menu row is `bg-primary/14`, an earned
badge `bg-primary/8`, the heatmap's three shades `bg-primary/25`, `/45` and
`/70`, and your own board row `bg-primary/8` with `border-primary/40`.

Three things keep a colour of their own on purpose, because they are
drawings rather than dividing lines:

- **The room you are in** is outlined in `border-primary/35`. It is the one
  card on Rooms marked as yours, and the accent is what marks it.
- **The LIVE VIBE pill on a room card** sits on the card's coloured picture,
  where a divider shade would vanish.
- **A locked badge's empty ring and a colour swatch's outline** draw a state
  and a sample, not a line between two things.

## Where the look lives

- `src/components/pomodoro/theme.css` holds the `--p-*` design tokens, copied
  from `apps/pomoder/src/styles.css`, and maps the shell's shadcn variables
  (`--background`, `--primary`, `--sidebar` and the rest) onto them. Light
  values sit on `:root`, dark under `.dark`, the shell's convention; the old
  app was the other way around (dark default, `.light` override) with the
  same two palettes.
- `src/components/pomodoro/fonts.ts` loads the two fonts from `public/fonts/`
  through the FontFace API.
- `src/components/pomodoro/pomodoro-shell.tsx` (the product shell) imports
  both and carries the `data-pomodoro-screen` marker on its root, so the
  whole frontend — sidebar, header and pages — gets the look. The stylesheet
  applies through `html:root:has([data-pomodoro-screen])`; the admin routes
  never render the product shell and are untouched, and nothing app-owned is
  imported from any shell file.
- **The stylesheet is also part of every page's first load**, imported by
  `src/components/pomodoro/landing-page.tsx`. The front page and the sign-in
  pages draw the product shell from a chunk loaded on demand, and a stylesheet
  that only came with that chunk arrived late: measured on 6 Oct 2026, the
  server's copy of the styles was removed about 200ms before the chunk's own
  landed, and `/` showed the shell's plain white look in between. A stylesheet
  carries no code, so this does not reopen the import circle the on-demand
  chunk exists for. On the admin screens it is 11KB that matches nothing. The
  fonts are not loaded this way, because loading their module starts the
  download.

## Rules the files enforce, and why

- **Tokens sit on the page root, never on a wrapper.** Dialogs, dropdowns and
  selects portal to `<body>`, outside any wrapper, and still have to resolve
  the theme. The old app learned this the hard way with a dark class on each
  portal; the `:has()` gate keeps root-level tokens while still scoping them
  to member screens.
- **No `url()` anywhere in `theme.css`.** A bundler that pulls a stylesheet
  server-side fails on a font url (the worker's esbuild has no `.woff2`
  loader), which is why the fonts load through JavaScript, not `@font-face`.
- **Selectors override by specificity, not import order.** The shell's
  theme.css declares the same variables on `:root` and `.dark`, and CSS import
  order is not guaranteed. Any variable overridden in one theme block must be
  overridden in both.
- **Signed-in member screens also need the `body.app-font` override.** The
  shell switches signed-in pages to Inter through that class, which beats a
  font set on `<html>`.
- **Text and icons on the orange are white in both themes** (`--p-on-accent`
  is `#ffffff` in each block of `theme.css`). Tyler's rule, 7 Oct 2026: "The
  orange button has black text on it when it should be white." He kept
  today's orange knowing what it costs: white on `#f2502d` measures 3.5 to 1
  in light mode and on `#ff5a3c` 3.1 to 1 in dark, both under the 4.5 to 1
  standard for small text. Where `--p-accent-2` is the background, white
  reads 4.8 to 1 in light (`#cc4225`) and 2.6 to 1 in dark (`#ff7a5c`). That is his decision, not an oversight, so do
  not darken the text back or retune the orange to "fix" it. Every primary
  button, badge and chip reads this one token through `--primary-foreground`
  and the shell's copies of it; nothing sets white per button. The selected
  left-menu row is not affected: it is a pale orange tint with orange text,
  not an orange surface.
- **The `--p-*-rgb` channel copies exist for overlays.** Screen tasks use
  them as `rgba(var(--p-canvas-rgb), .58)` for shades over timer backgrounds.
- **Never copy pomoder's CSS files or its `.pomoder-*` classes.** Screens are
  built from the shadcn components in `src/components/ui/`, styled by these
  tokens; each screen task carries its own side-by-side look check against
  the old app.

## One control height

Every control on a member screen is one of the four heights the repo's UI
rules allow: 24, 28, 32 or 36 pixels, and 32 is the default. The skin comes
from the `--p-*` tokens on top of a shared component; the height never comes
from a class written at the call site. A rebuilt control drifts from the real
one every time the real one changes, which is what the list below fixed.

What moved, and what it was:

- **The header's glassy quick pills** were 42px, then 32px, and are 36px
  since Tyler asked for them 10% larger on 7 Oct 2026
  (`quick-controls-header.tsx`, `quickPillClass`; see
  [the product shell](product-shell.md)). The colour-mode toggle, the
  account photo and Register are still 32px.
- **Register** was 41px, built from `px-[22px] py-[11px]`, and is the shared
  `Button` at its 32px default with only the orange on top.
- **The colour-mode toggle keeps its own moon-and-sun pill** and was not
  moved onto a shared control. It is already 32px (`h-8 w-14`), so it was
  never the reason the row stepped, and Tyler asked on 30 Sep 2026 for its
  styling to be put back after a swap to `ui/theme-switcher.tsx`. It is the
  one deliberate rebuilt control on these screens: the sliding knob runs
  through `element.animate()` rather than a CSS transition, because the
  shell's theme provider drops `*{transition:none!important}` over the page
  for two frames while it flips the class and a CSS transition never plays
  through that. `ThemeTogglePill` in `pomodoro-shell.tsx` holds the reasoning
  in full.
- **Start** is the shared `Button` at 36px, where the hand-written pill
  already sat. **Reset** and **Zen mode** were 44px circles and are 36px,
  the largest allowed height, because a 32px control looks lost inside the
  ring.
- **The mode strip is a real `ui/tabs.tsx`**, the same segmented control
  History's range strip uses. The hand-rolled version claimed
  `role="tablist"` while behaving like three unrelated buttons. The sliding
  orange chip went with it; the segmented pill is what the shared component
  draws.
- **List rows** on the tasks page, the projects card and the leaderboard were
  44px (`min-h-11`) and are 36px (`min-h-9`), which holds their 28px buttons
  with room to spare.
- **The dashboard's remove button** was 30px and is the shared `Button` at
  `icon-sm`, 28px. **The session-note bar** was 42px and is 36px.

Three things keep a height that is not on the list, on purpose:

- **The sidebar's nav rows stay 44px.** They are navigation, not controls,
  and 44px is the touch target a phone wants.
- **The timer's Focus, Short break and Long break tabs are 48px**, each tab
  36px inside the strip. Tyler asked for them large on 7 Oct 2026; see
  [The timer](timer.md).
- **A row's own title button has no fixed height.** It is text, and its
  height follows the line it holds.

## Known gap

`src/lib/layout/scaffold-styling.ts` (a generator-written shell file, not
edited by the app) imports `ShellStyling` from `@/lib/custom-shell`, which no
longer exports it, so `tsc --noEmit -p tsconfig.app.json` fails on that one
line. Custom-shell's own copy imports from `@/lib/layout/styling-values`.
