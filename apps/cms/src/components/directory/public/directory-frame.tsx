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
export function DirectoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <PublicPageFrame className="place-items-start justify-items-center">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 md:gap-3">
        {children}
      </div>
    </PublicPageFrame>
  )
}
