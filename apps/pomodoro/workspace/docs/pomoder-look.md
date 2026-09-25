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

## Known gap

`src/lib/layout/scaffold-styling.ts` (a generator-written shell file, not
edited by the app) imports `ShellStyling` from `@/lib/custom-shell`, which no
longer exports it, so `tsc --noEmit -p tsconfig.app.json` fails on that one
line. Custom-shell's own copy imports from `@/lib/layout/styling-values`.
