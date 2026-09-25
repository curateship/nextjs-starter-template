import * as React from "react"

import { PublicPageFrame } from "@/components/shell/public-page-frame"

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
       */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 text-left md:gap-3">
        {children}
      </div>
    </PublicPageFrame>
  )
}
