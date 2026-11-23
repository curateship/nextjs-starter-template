# Public images sized for the screen

Every picture on CMS's public pages comes with a list of smaller copies, and
the browser downloads the smallest one that still looks sharp in its slot.
Pictures far down a page wait until the visitor scrolls near them.

## How the copies work

The copies come from Custom Shell, which CMS inherits unchanged.

- **Three widths are offered: 400, 800 and 1600 pixels**, plus the original
  for a screen that wants more (`MEDIA_IMAGE_WIDTHS` in
  `src/lib/media/image-sizes.ts`).
- **A copy is cut the first time a browser asks for it**, by
  `/api/v1/media/resized`, and saved in the bucket beside the original. Every
  later visitor is sent straight to the saved copy. Pictures uploaded before
  this existed therefore get copies too, with no upload step and no backfill.
- **A picture already narrower than a width gets its original instead.** No
  copy is cut that would be bigger than the file it came from.
- **SVG and GIF files are never resized.** An SVG already draws at any size,
  and resizing an animated GIF would lose the animation.
- **Only pictures in this app's own bucket can be resized.** The route refuses
  any other address, so it can never be used to fetch somebody else's images.
  A picture typed in as an outside address would show as broken where a copy
  is asked for. The Eat Drink Toronto photos checked on 16 Oct 2026 were all
  in the bucket.

## Which pictures use it

Each `<img>` passes its address through `mediaImageSrcSet` and says how wide
its slot is with `sizes`. The browser picks from those two.

- **Cards** for listings, categories, posts, deals and events. Cards are lazy.
- **A listing's page:** the main photo (loads at once, because it is the first
  thing on the page), the gallery, image fields and the "Also nearby" photos
  (all lazy).
- **A category page's picture, and the cover of a post, a deal and an event.**
  Each opens its page, so each loads at once.
- **Not resized:** the photo preview on the public "Add an event" form. It is
  the visitor's own file, still on their computer, never a stored address.

## Lazy loading

- **`loading="lazy"` goes on every picture that can sit below the first
  screen.** The browser starts loading a lazy picture a little before it
  scrolls into view. On a fast connection Chrome starts about 3,000 pixels
  ahead.
- **A picture that opens its page is never lazy.** Waiting for it would make
  the first thing the visitor looks at arrive last.

## The card grids' size hint is generous on purpose

A listing card says it is half the window wide above 640px, so a desktop grid
of four 266px cards downloads the 800px copy. The same card is drawn four
across, three across, one per line and inside a map pin, and one hint has to
cover them all. A tighter hint would blur the one-per-line layout. The 800px
copy is still far smaller than a large original.

## How to check it

1. Open http://eat-drink-toronto.localhost:3015/directory/archeo in Chrome
   with the developer tools' Network panel on, filtered to Img.
2. At phone width the "Also nearby" photos arrive from addresses containing
   `/sizes/400/`.
3. Open http://eat-drink-toronto.localhost:3015/directory at phone width and
   do not scroll. The last few cards are not in the Network panel until you
   scroll down.
4. Open http://eat-drink-toronto.localhost:3015/events/harvest-food-festival
   on a wide window. The cover arrives from `/sizes/1600/`.
