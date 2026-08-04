# Writing a public page

Public pages are the ones anybody can reach without signing in: the front page,
pricing, the whole sign-in family, and the maintenance page. They are written as
code — there is no page builder, and there is not going to be one. The theme is
the control surface instead.

## The one rule

**Never write a color, a font or a corner radius into a public page.** Use the
theme tokens the app already has, and the page follows whatever the admin saved
without you touching it again.

| Instead of | Write |
| --- | --- |
| `bg-white`, `bg-[#f5f5f5]` | `bg-card` for a card, `bg-muted/60` for the canvas |
| `text-[#111]`, `text-black` | `text-foreground`, or `text-muted-foreground` for the quiet line |
| `bg-blue-600` on a button | nothing — the shared `Button` is already the brand color |
| `border-gray-200` | `border-foreground/5`, `ring-foreground/10` |
| `rounded-[10px]` | `rounded-xl`, `rounded-lg` |
| `font-['Inter']` | nothing — the page inherits the theme's face |

If you find yourself reaching for a raw color, the answer is almost always an
existing token. The one fair exception is a colour that means something on its
own, like the green tick on a "check your email" notice.

## Where the theme comes from

One saved theme, app-wide, in the settings row — no migration, it rides in the
same JSON blob as the app name and logo. It holds a brand color, a background
color, a text color, a font, corner roundness, and whether a visitor who has
never picked gets light or dark.

`__root.tsx` loads it on the **server** and puts it on `<body>` as CSS
variables, so it is in the very first paint. That is deliberate: applying it
after load would show the default look for a moment and then blink.

The pieces, if you need them:

- `src/lib/public-theme.ts` — the shape, the guards, and `publicThemeStyle()`
  which turns it into CSS variables.
- `usePublicTheme()` in `src/lib/branding.ts` — read it inside a component.
- `PublicPageFrame` (`src/components/shell/public-page-frame.tsx`) — the shared
  frame. It paints the canvas and the branding; use it and you get the theme for
  free.

## Things worth knowing

- **A value nobody set is not painted at all.** An empty color leaves the app's
  own token alone, which is why an install with no saved theme looks exactly as
  it did before the theme existed.
- **Fonts must be self-hosted.** Inter is bundled in `public/fonts`. Anything
  new has to be bundled the same way — pulling a face from Google slows the page
  down and tells them who visited.
- **The theme never reaches the signed-in app.** That has its own per-workspace
  styling (Settings → Styling). Two separate systems, on purpose: one is what
  visitors see, the other is what an admin tunes for themselves.
- **The button label colour is worked out for you.** Pick a pale brand color and
  the label goes dark; pick a dark one and it goes light.
- **Check both light and dark.** The saved background and text colors are single
  values — they do not swap when the scheme does. A background picked for light
  mode with the dark scheme switched on is the admin's mistake to make, but the
  page still has to be legible with no theme saved either way.
