import * as React from "react"

import { CoverSky } from "@/components/shared/notes/cover-sky"
import { SKY_COVER } from "@/lib/notes/page-cover"

/**
 * A page's cover photo, lying faintly behind the panel's header and fading
 * into the page, as Project's team and project pages draw theirs
 * (`TeamCoverBanner` in `apps/project/src/components/project/team-figures.tsx`,
 * copied 7 Nov 2026; Tyler: "both panel is missing cover photo"), or the sky
 * (`SKY_COVER`). A picture that no longer loads is left out rather than
 * drawn broken.
 */
export function PageCover({ url }: { url: string | null }) {
  const [broken, setBroken] = React.useState<string | null>(null)
  if (!url || broken === url) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden"
    >
      {url === SKY_COVER ? (
        // Project's sky, following the viewer's clock (Tyler, 8 Nov 2026).
        <div className="absolute inset-0 opacity-45">
          <CoverSky />
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
