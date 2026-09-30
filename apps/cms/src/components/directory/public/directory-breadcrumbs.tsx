import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"

import { usePublicTheme } from "@/lib/branding"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * How far under the header the trail sits.
 *
 * The trail is a label for the page, not a part of it, so it keeps a small
 * fixed gap of its own instead of the site's page spacing — 40px of air above
 * two words read as a mistake, and pushed the page's real first line down
 * twice as far as the line under it.
 */
const BREADCRUMB_TOP_SPACE = 16

/**
 * How far above the page's first line the trail sits.
 *
 * The column's own gap is the site's Spacing setting, 12px by default, and the
 * trail has already been pulled up towards the header. A trail 12px above a
 * heading reads as part of the heading, so 24px is the floor. A site with
 * wider spacing than this keeps what it chose, and flat mode, which is a
 * spacing of 0 and means no gaps anywhere, gets none of it.
 */
const BREADCRUMB_BOTTOM_SPACE = 24

/**
 * Where a page sits: site home → Directory → its category → itself, or site
 * home → Posts → the post, site home → Events → the event, or site home →
 * Deals → the deal.
 *
 * The last step is the page you are on, so it is plain text with
 * `aria-current` rather than a link back to where you already are.
 */
export type Crumb = {
  label: string
  categorySlug?: string
  home?: boolean
  posts?: boolean
  events?: boolean
  deals?: boolean
}

export function DirectoryBreadcrumbs({
  crumbs,
  inBand = false,
}: {
  crumbs: Crumb[]
  /**
   * True on a page that draws the trail inside its top band, which already
   * cancels the page's spacing and adds its own. Only the Events page does.
   */
  inBand?: boolean
}) {
  const theme = usePublicTheme()
  // Both gaps are worked out from the site's own settings rather than written
  // here, so a site that widened its spacing does not get a field of empty
  // background above three words, and one that tightened it still gets a
  // readable gap under them. The top is never positive and the bottom is never
  // negative: each only corrects the column's gap towards the trail's own.
  const spacing = inBand
    ? undefined
    : {
        marginTop: Math.min(0, BREADCRUMB_TOP_SPACE - theme.mainSpacing),
        marginBottom: theme.gutter
          ? Math.max(0, BREADCRUMB_BOTTOM_SPACE - theme.gutter)
          : 0,
      }

  return (
    // The same trail the shell draws on its own public pages: a chevron
    // between the steps rather than a slash, the words at the page's own size,
    // and the page you are on in full black. One look for every public page,
    // whichever half of the app drew it.
    <nav aria-label="Breadcrumb" className="w-full" style={spacing}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            // `min-w-0` here and `wrap-anywhere` on the last step, so a long
            // name can shrink below its own text width and break mid-word
            // rather than pushing the page sideways on a phone.
            <li
              key={`${crumb.label}-${index}`}
              className="flex min-w-0 items-center gap-x-1.5"
            >
              {index > 0 ? (
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-60"
                />
              ) : null}
              {last ? (
                <span
                  aria-current="page"
                  className="min-w-0 font-medium wrap-anywhere text-foreground"
                >
                  {crumb.label}
                </span>
              ) : (
                <CrumbLink crumb={crumb} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function CrumbLink({ crumb }: { crumb: Crumb }) {
  const className = `rounded-sm transition-colors hover:text-foreground ${focusRing}`

  if (crumb.home) {
    return (
      <Link to="/" className={className}>
        {crumb.label}
      </Link>
    )
  }
  if (crumb.posts) {
    return (
      <Link to="/posts" search={{}} className={className}>
        {crumb.label}
      </Link>
    )
  }
  if (crumb.events) {
    return (
      <Link to="/events" search={{}} className={className}>
        {crumb.label}
      </Link>
    )
  }
  if (crumb.deals) {
    return (
      <Link to="/deals" search={{}} className={className}>
        {crumb.label}
      </Link>
    )
  }
  if (crumb.categorySlug) {
    return (
      <Link
        to="/directory/category/$slug"
        params={{ slug: crumb.categorySlug }}
        className={className}
      >
        {crumb.label}
      </Link>
    )
  }
  return (
    <Link to="/directory" className={className}>
      {crumb.label}
    </Link>
  )
}
