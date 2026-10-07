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
- **The on-accent text colour stays dark in both themes** (`--p-on-accent`),
  so text on an orange button never flips to white in light mode.
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

- **The header's glassy quick pills** were 42px and are 32px
  (`quick-controls-header.tsx`, `quickPillClass`). The colour-mode control
  beside them was already 32px, so the row stepped up and down.
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

Two things keep a height that is not on the list, on purpose:

- **The sidebar's nav rows stay 44px.** They are navigation, not controls,
  and 44px is the touch target a phone wants.
- **A row's own title button has no fixed height.** It is text, and its
  height follows the line it holds.

## Known gap

`src/lib/layout/scaffold-styling.ts` (a generator-written shell file, not
edited by the app) imports `ShellStyling` from `@/lib/custom-shell`, which no
longer exports it, so `tsc --noEmit -p tsconfig.app.json` fails on that one
line. Custom-shell's own copy imports from `@/lib/layout/styling-values`.
