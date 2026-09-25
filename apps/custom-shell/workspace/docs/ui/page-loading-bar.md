# The bar while a page loads

A thin line runs across the very top of the window while the next page loads.
The router keeps the old page on screen until the new page has its data, so
without the line a click on a slow page looks like it did nothing.

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
- **Every page:** the root route draws it, so signed-out pages such as the
  pricing page get it as well as the signed-in app.

## What does not show it

- **Refreshing the page you are on.** After a save, a screen often reloads its
  own data. The address does not change, so no line appears. Only a change of
  address counts, which includes a change of tab or filter kept in the address.

## Where it lives

- `src/components/shell/page-loading-bar.tsx` draws the line and reads the
  router's loading state.
- `src/routes/__root.tsx` mounts it once, beside the toaster.
