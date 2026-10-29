# Pictures on carousel slides

The Image panel in the carousel editor takes pictures and clips four ways:
upload them, drop them, pick them from a collection, or find a free photo on
Pexels. A cropped picture can be moved inside its box.

## Uploading and dropping

- **Drop or click:** drop files on the dashed box in the Image panel, or click
  it to pick files. Both upload onto this carousel's shelf.
- **Dropping on the slide** uploads the files and places them on the picked
  slide. The first is centred where it was dropped, and each next one sits 20
  pixels further down and right. One drop is one undo step.
- **What it takes:** PNG, JPG and WEBP pictures, and MP4, MOV and WEBM clips
  (see [carousel-video-slides.md](carousel-video-slides.md)). Anything else
  is refused before any upload starts, with "Only pictures and clips can go on
  a slide".
- **Room:** a drop that would pass 50 layers on the slide is refused with the
  usual message.
- **While uploading** the slide says "Uploading…".

## Moving a cropped picture

A picture set to Fill or Crop covers its box and loses the parts that do not
fit. Which part shows can be moved.

- **On the slide:** double-click the picture. Its outline turns dashed, and
  dragging moves the picture inside its box. Dragging right shows more of its
  left side. Escape, or a click anywhere else, ends it. The whole drag is one
  undo step.
- **In the inspector:** Crop position, under Fit, has two sliders, Left to
  right and Top to bottom, from 0 to 100. 50 and 50 is the middle, where every
  picture starts.
- **Fit shows the whole picture,** so it has no crop position.
- **Saved as** `focusX` and `focusY` on the layer. Missing means the middle.
- **Align all slides** never copies a crop position, because it belongs to
  the picture, not the box.

## Fill used to stretch in the export

Before 21 Oct 2026 the canvas drew Fill as a crop and the export drew it
stretched, so a photo whose shape differed from its box came out squashed.
Both now crop, and the export places the picture with its real size and the
crop position (`pictureRect` in `src/server/video/carousel-export.ts`).

## Pictures from your collections

The Image panel's header has search, a funnel and +, the same as the video
editor's Media panel. The + uploads files. The funnel opens the same filter
menu the Media panel has (see [media-panel.md](media-panel.md)), drawn from
Tyler's picture of 29 Oct 2026, with two differences:

- **Type** has only Video and Image, because sound never goes on a slide.
  None on shows both.
- **Collection** starts with This carousel, then each collection, then **+
  New collection**. There is no All media, no Uncollected and no Clear
  filters. Picking This carousel and turning the types off is the reset.
- **The numbers:** This carousel counts this carousel's own files. A
  collection counts its files from your whole library. Both use the ticked
  types and the search.
- **Saved views** are kept apart from the Media panel's, under
  `carousel-media:library`, and show in every carousel.

Picking a collection lists its pictures and clips from your whole library,
not only this carousel's uploads. Until 29 Oct 2026 a collection listed
pictures only. A file placed from a collection joins this carousel's shelf.

The dashed "Drop or import media" box only shows while this carousel has no
files of its own. Files dropped on the canvas still join the shelf.

The collections task (`#archive/features/25-collections-you-can-make.md`)
only ever covered the video editor's Media panel. No reason for leaving
carousels out was written down, so this was scope, not a decision. A
collection's pictures have no delete on their right-click here, because they
belong to the library, not to this carousel.

## Free photos from Pexels

Under the media, "Free photos" searches Pexels' photo library.

- **The shape:** a 4:5 or story carousel asks for tall photos first, a square
  one for square photos.
- **One press** downloads the photo on the server, keeps it in the library
  and on this carousel's shelf, and places it on the slide.
- **The credit:** the photo's description is "Photo by Jane Doe on Pexels"
  with the photo's and the photographer's pages. The grid links to Pexels.
- **The key and the hour:** the same Pexels key as B-roll, set by an admin in
  Settings → Pexels, and the same 200 searches an hour (see
  [b-roll.md](b-roll.md)). A photo search counts as one.
- **What is fetched:** only Pexels' picture host, `images.pexels.com`, and a
  redirect away from it is refused, the same guard as a B-roll clip.

The code is `searchPexelsPhotos` and `downloadPexelsPhoto` in
`src/server/video/pexels.ts` and `src/server/video/carousel-stock.ts`.

## Stickers

The Text panel's stickers are your own list, the same one the video editor
uses (see [stickers.md](stickers.md)). An emoji lands as a text layer, as the
fixed eight always did. A picture sticker lands as a picture a third of the
slide wide, in the middle. Adding or removing a sticker in either editor
changes the list in both.
