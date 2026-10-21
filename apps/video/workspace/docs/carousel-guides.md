# Instagram guides on the carousel canvas

The Guides button on the canvas, left of the shape switch, shades the parts of
a slide that Instagram covers or cuts off. The guides are never part of the
carousel and never export. This browser remembers whether they were left on.

## What is shaded

- **Story (9:16):** the top 14 out of 100, the bottom 35 out of 100 and 6 out
  of 100 on each side. Instagram draws the account name, the reply box and its
  buttons there. Source: Meta's Ads Guide for Instagram Stories, read
  21 Oct 2026, which says to "leave roughly 14% of the top, 35% of the bottom,
  and 6% on each side" free
  (<https://www.facebook.com/business/ads-guide/update/image/instagram-story>).
- **Feed post (4:5 and 1:1):** the sides the profile grid cuts off, because
  the grid shows every post as a 3:4 tile from its middle. On a 4:5 slide that
  is 33.75 pixels off each side, and on a square slide 135 pixels.

## Where the grid number comes from

No Instagram or Meta page gives the 3:4 tile. The number comes from Adam
Mosseri's Instagram story of January 2025, as reported by Inquirer and
exchange4media and read 21 Oct 2026. The task asked for numbers from
Instagram's or Meta's own pages, so whether to keep this guide is Tyler's call.

The positions are `instagramGuide` in `src/lib/video/carousel-guides.ts`.
