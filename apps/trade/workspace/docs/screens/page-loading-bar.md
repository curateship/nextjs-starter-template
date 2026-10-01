# The bar while a page loads

A thin line runs across the very top of the window while the next page loads.
The app keeps the old page on screen until the new page has its data, so
without the line a click on P&L or Backtests looks like it did nothing.

## What you see

- **Fast pages:** a page that arrives within 200ms shows no line at all, so
  quick clicks never flash.
- **Slow pages:** after 200ms the line appears on the left and grows to about
  nine tenths of the width over eight seconds. The growth slows down as it
  goes, so a very slow page never makes the line look finished.
- **When the page is ready:** the line runs to the right edge and fades out
  in under half a second.
- **Reduced motion:** with the system's reduce-motion setting on, the line
  appears full width and still, and vanishes when the page is ready.
- **Clicks go through it.** The line sits over the header's own buttons and
  never catches a click.
- **Colour:** it takes the theme's main colour, so it follows light mode, dark
  mode and any saved colour.
- **Every page, signed in or out.** The login page shows it too, from
  28 September 2026, because it is drawn once from the root route rather than
  from the signed-in header.

## What does not show it

- **Refreshing the page you are on.** After a save, the app often reloads the
  current page's data. The address does not change, so no line appears. Only
  a change of address counts, which includes a change of tab or filter kept in
  the address.

## Where it lives

- `src/components/shell/page-loading-bar.tsx` is the one that draws it, from
  the root route at `src/routes/__root.tsx:297`. It is a shell file, so it is
  never edited here.

Trade had a copy of its own, mounted in `pinned-markets-header.tsx`, from
before the shell had one. The shell's arrived in the 28 September 2026 merge
and the two drew on top of each other until 30 September, when Trade's copy,
its test, its mount and the stub in the header's test were all deleted. There
is one line again.
