# Carousel preview

Preview in the carousel editor shows the carousel the way Instagram does on a
phone: one slide at a time in a phone-shaped frame, with the caption under it.

- **Moving through:** swipe or drag the slide sideways. A swipe a little under
  a fifth of the slide's width moves one slide. The arrows on the slide and the
  left and right arrow keys step too.
- **At either end** the slide drags with a pull and springs back, as on a
  phone.
- **The place:** "3/7" sits top right, as Instagram shows it, and a row of
  dots under the slide marks the current one.
- **The caption** sits under the dots. With none, the line says to add one in
  the Export window.
- **What it draws:** the same layers as the canvas and the export, hidden
  layers left out.

The window is `PhonePreviewDialog` in
`src/components/carousel-studio/phone-preview.tsx`.
