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

## What does not show it

- **Refreshing the page you are on.** After a save, the app often reloads the
  current page's data. The address does not change, so no line appears. Only
  a change of address counts, which includes a change of tab or filter kept in
  the address.
- **Signed-out pages** such as the login page. The line lives in the signed-in
  header.

## Where it lives

- `src/components/trade/page-loading-bar.tsx` draws the line and reads the
  router's loading state.
- `src/components/trade/pinned-markets-header.tsx` mounts it. The header is
  the one app-owned piece the shell draws on every signed-in page, which is
  also why the Hide profit and loss switch is synced from there.
- Custom Shell now draws the same line from its root route
  (`src/components/shell/page-loading-bar.tsx`). Trade keeps its own copy only
  until the next shell merge brings that one in. The merge must delete
  `src/components/trade/page-loading-bar.tsx`, its test, its mount in
  `pinned-markets-header.tsx` and the stub in that file's test. If it doesn't,
  two lines draw on top of each other.
