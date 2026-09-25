# The front page

`/` serves the timer itself, guests included — the product demos itself,
exactly as the old app served its dashboard at the front door. Wired
through the shell's `landing.page` option (`src/app/options.ts` →
`src/components/pomodoro/landing-page.tsx`): the loader asks who is
visiting, a guest gets the guest engine, and a signed-in person gets
their own dashboard at the same address.

Two constraints shape the file:

- Everything heavy sits behind dynamic imports, because `options.ts` is
  inside the app-options import circle — a top-level import of any
  `@/lib/api/*` module from the landing module builds server functions
  while modules are still loading and breaks at boot.
- The product routes carry no `*.page.ts` declarations. The Pages screen
  governs content pages; the shell's own registry tests insist every
  declared page is shell-owned and switchable pages live top-level (CMS
  hit the same wall — see its directory.page.ts). Product screens are the
  app itself, so they stay out of that registry; `/timer` and friends are
  ordinary routes, and the shell's own `/pricing`, `/login` and admin
  pages are untouched.
