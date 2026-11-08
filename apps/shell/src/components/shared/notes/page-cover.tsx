import * as React from "react"

import { CoverSky } from "@/components/shared/notes/cover-sky"
import { SKY_COVER } from "@/lib/notes/page-cover"
import { cn } from "@/lib/utils"

/**
 * A page's cover photo, lying faintly behind the panel's header and fading
 * into the page, as Project's team and project pages draw theirs
 * (`TeamCoverBanner` in `apps/project/src/components/project/team-figures.tsx`,
 * copied 7 Nov 2026; Tyler: "both panel is missing cover photo"), or the sky
 * (`SKY_COVER`). A picture that no longer loads is left out rather than
 * drawn broken.
 */
export function PageCover({ url, extension = false }: { url: string | null; extension?: boolean }) {
  const [broken, setBroken] = React.useState<string | null>(null)
  if (!url || broken === url) return null
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden",
        // Behind everything in its frame, which is \`isolate\`, so the record's
        // body and footer draw over it without each needing to be lifted.
        extension && "-z-10"
      )}
    >
      {url === SKY_COVER ? (
        // Project's sky, following the viewer's clock (Tyler, 8 Nov 2026).
        <div className="absolute inset-0 opacity-45">
          <CoverSky lights={!extension} />
        </div>
      ) : (
        <img
          src={url}
          alt=""
          className="size-full object-cover opacity-45"
          onError={() => setBroken(url)}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
    </div>
  )
}

/**
 * The right panel's cover: the left page's, carried on (Tyler, 8 Nov 2026:
 * "Add the same cover image pattern as in the left panel for the right panel
 * too but for the sky default bg, make it an extension of the left panel.
 * Meaning that we don't have the sun and moon on the right"). A picture is
 * the same picture; the sky is the same sky with no sun or moon. A dashboard
 * hands it down with `RightCoverProvider`; the record frames draw it.
 */
const RightCover = React.createContext<string | null>(null)

export const RightCoverProvider = RightCover.Provider

/** The cover a right panel carries on from the left page, if any. */
export function useRightCover() {
  return React.useContext(RightCover)
}

/** Drawn first in a right panel's frame, which is `relative isolate`. */
export function RightPanelCover() {
  return <PageCover url={useRightCover()} extension />
}
