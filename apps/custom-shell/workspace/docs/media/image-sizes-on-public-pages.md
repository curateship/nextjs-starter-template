# Picture sizes on public pages

A picture on a public page arrives at a size that suits the screen asking for
it, not at the size it was uploaded. A phone loading the front page takes an
11KB copy of a 63KB logo. The media library on a phone takes 583KB of pictures
where the uploaded files add up to 3,456KB.

## The three widths

Every picture is offered at 400, 800 and 1600 pixels wide, plus the file that
was uploaded. The browser reads the list and picks one. `MEDIA_IMAGE_WIDTHS` in
`src/lib/media/image-sizes.ts` is the list, and nothing else decides it.

Three widths, not a ladder of ten. Every extra width is another file in storage
for every picture ever uploaded, and the browser only downloads one of them.

Two kinds of file are left alone and always arrive as uploaded:

- **SVG**, which is a drawing that redraws itself at any size. A smaller copy
  would be a worse file.
- **GIF**, because narrowing an animation means narrowing every frame, which
  costs more than the bytes it saves.

## When a copy is cut

The first time any browser asks for a width, the app cuts that copy, stores it
beside the original, and sends the browser to it. Every request after that is a
redirect straight to the stored copy. No upload is slowed down by this, and no
backfill was needed: a picture uploaded two years ago gets its copies the first
time somebody looks at a page that shows it.

Everyone who asks for the same copy while it is still being cut waits on that
one cut, rather than each decoding the picture themselves. A busy page's first
visitors would otherwise all arrive at once and all do the same work.

The copies sit at `<owner>/sizes/<width>/<the original key>`. They have no media
record of their own, the same way the browser-tab icons have none. Deleting the
picture deletes them, and the orphan tool on the media page ignores them so
nobody is offered them for deletion.

`/api/v1/media/resized` is the address that does this. It answers signed-out
visitors, because the pictures it points at are already public. Two rules keep
it from being anything more:

- **It only ever points inside this app's own bucket.** An address that is not
  under the bucket's public URL is refused, so it cannot be used to fetch or
  redirect to anywhere else.
- **It only cuts the three widths above.** Any other width is refused, so nobody
  can fill the bucket with copies at every width they can think of.

Anything that goes wrong sends the browser to the original picture instead. A
storage outage, a file that has gone missing, a format sharp cannot read: all of
them end at the address the page asked for, so a page never shows a
broken-image box because a resize failed.

## What waits for a scroll

A picture on the first screenful loads with the page. Everything below it waits
until the visitor scrolls near it.

On the front page, the first row is the first screenful, so its pictures load
straight away and every row after it waits. `FrontPageRows` decides this from
the row's position and passes `eager` down. In the media library and the
picker, every tile waits, because a grid of tiles is mostly below the fold.

## Telling the browser how wide the box is

A browser cannot see the page's layout when it picks a copy, so each picture has
to be told how wide it will be drawn. That is the `sizes` prop on
`MediaThumbnail`, and it is a CSS length such as `"112px"` or a list such as
`"(min-width: 768px) 50vw, 100vw"`.

**A picture with no `sizes` is offered no copies at all.** Without it a browser
assumes the picture fills the window and takes the widest copy, which is worse
than taking the original once. So a new picture on a screen gets its `sizes`
written when it is added, or it keeps the old behaviour and nothing breaks.

## Where this applies today

- The logo above every signed-out page.
- Front-page logo rows and screenshot rows.
- The media library grid and its list rows.
- The media picker's grid and its rows.

Signed-in screens other than the media ones still send the uploaded file. They
gain the smaller copies the day somebody adds a `sizes` to them.

**An avatar is deliberately left out**, including the photo beside a
front-page testimonial. `AvatarImage` decides whether to draw the picture or
the person's initial by loading the address on a bare `new Image()` first, and
that pre-load cannot read a `srcset`. Giving an avatar a `srcset` therefore
downloads the uploaded file and then a smaller copy on top of it, which is more
bytes than leaving it alone. Any avatar needs a different component before it
can have copies.

## Two things to know

**The width comes last in the address.** `?src=...&w=400`, never the other way
round. With `src` last the whole address ends in `.webp` or `.jpg`, and the dev
server's static file handler answers it instead of the app. That is a 404 on
every picture in local development and it is easy to reintroduce by tidying the
parameters into a different order.

**Local development needs a forwarding rule.** Nitro's dev middleware skips a
request by what the browser says it wants, and an `<img>` asks for an image.
`assetDevRoutes` in `vite.config.ts` forwards `/api/v1/media/resized` and
`/public-font.woff2` past that middleware. A deployed build has no such
middleware and needs no such rule.
