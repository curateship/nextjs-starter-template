import * as React from "react"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { pageGutter } from "@/lib/layout/shell-gutter"

/**
 * The column every public directory page is drawn in.
 *
 * The shell's `PublicPageFrame` is doing the real work — it already carries
 * the branding of whichever site's address the visitor typed, because
 * `readBranding` resolves the site from the domain. So none of these pages
 * asks for a logo or a name; they get the right one by being inside this.
 *
 * The width and the gap are the pricing page's, which is the shell's other
 * wide public page. Same shape, so the two do not drift apart.
 *
 * The one thing changed is where the content sits. The frame centres its child
 * in the window, which is right for a sign-in card and wrong for a list — a
 * directory with four things in it would float in the middle of the screen. So
 * it is pinned to the top and left centred across, through the frame's own
 * `className`, which is the shell's supported way to say this. Nothing is
 * forked.
 */
export function DirectoryFrame({
  children,
  hero,
}: {
  children: React.ReactNode
  /**
   * The band above the page's column, drawn across the whole content area
   * rather than inside the 1152px column. Only the browse page has one.
   *
   * It is a child of the frame rather than of the column below it, because a
   * band that stopped where the listings stop would read as a card and not as
   * the top of the page.
   */
  hero?: React.ReactNode
}) {
  return (
    <PublicPageFrame
      /*
       * `grid-cols-1` is load-bearing, not tidying. The frame's grid sizes its
       * one column to its widest child, and the browse page's band is wider
       * than the page on purpose — without this the band drags the column out
       * with it and the whole page ends up offset and scrolling sideways on a
       * phone. `grid-cols-1` is `minmax(0, 1fr)`, so the column is the width
       * of the page and the band overflows it quietly.
       */
      className="grid-cols-1 place-items-start justify-items-center"
    >
      {hero}
      {/*
       * 1152px: the width the old Eat Drink Toronto pages are drawn at, and
       * the width a listing's two columns need before the narrow one stops
       * being narrow.
       *
       * `text-left` because a site's Styling settings can centre its public
       * text, which is right for a page of marketing and wrong for a list of
       * records: it centres a phone number over an address and a field's name
       * over its value. A directory page is a record either way, so it reads
       * from the left whatever the site chose. Anything that genuinely is
       * centred — an empty list, the pager — still says so on itself.
       *
       * The pair below says the same thing to the rows that align themselves
       * rather than their text — a hero's button, its stars, the line under
       * it. They carry the shell's `group-data-[content-alignment=…]` classes,
       * and this column is the ancestor that answers "left" for them. Without
       * it a centred site drew a heading on the left with its button in the
       * middle, which is how Tyler found it on 27 Sep 2026.
       *
       * Those classes match **any** ancestor rather than the nearest one, and
       * `justify-start` wins when two of them match, so a row that wants the
       * middle cannot get it by declaring a nearer group. That is why a centred
       * home page row overrules them itself, in `app/directory-front-page.tsx`.
       *
       * The shell's own group is untouched, so the header and the footer still
       * follow Settings → Public → Styling → Content alignment.
       */}
      <div
        className="group/public-content mx-auto flex w-full max-w-6xl flex-col text-left"
        data-content-alignment="left"
        // The space between a page's cards is the site's own, from Settings →
        // Public → Styling → Spacing, the same value the grids of cards inside
        // them use. A fixed gap here left the page's own blocks closer
        // together than the cards within them on a site that widened its
        // spacing.
        style={{ gap: pageGutter }}
      >
        {children}
      </div>
    </PublicPageFrame>
  )
}
