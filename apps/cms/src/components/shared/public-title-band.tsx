import * as React from "react"

import { PublicHeroBand } from "@/components/shared/public-hero-band"

/**
 * The band at the top of a public page that has a name and a line under it but
 * nothing to search with: a category, and any page like it.
 *
 * It is the browse page's band with the search bar taken out, so a category
 * opens the same way the directory does — the dotted band flush under the
 * header, the trail, the name at the page's largest size, and the line under
 * it. Tyler asked for this on 27 Sep 2026, when a category's name was plain
 * text on white and the directory's was a band.
 *
 * The band itself, its width and its dots are `PublicHeroBand`, which the
 * browse page and the Events page use too.
 */
export function PublicTitleBand({
  crumbs,
  title,
  intro,
  picture,
}: {
  /** The trail, drawn inside the band above the name. */
  crumbs: React.ReactNode
  title: string
  /**
   * What sits under the name: a line about the page, or the stars on a
   * listing. A page with nothing to say there gets the name alone.
   */
  intro?: React.ReactNode
  /** A picture beside the words, when the page has one. */
  picture?: React.ReactNode
}) {
  return (
    <PublicHeroBand>
      {crumbs}
      {/* The words and the picture sit on one line above 768px and stack under
          it, with the picture second either way: somebody opening a category
          wants its name first. */}
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            {title}
          </h1>
          {typeof intro === "string" ? (
            <p className="text-base text-muted-foreground">{intro}</p>
          ) : (
            intro
          )}
        </div>
        {picture}
      </div>
    </PublicHeroBand>
  )
}
