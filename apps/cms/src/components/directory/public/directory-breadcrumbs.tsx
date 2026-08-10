import { Link } from "@tanstack/react-router"

import { focusRing } from "@/lib/layout/focus-ring"

/**
 * Where a page sits: site home → Directory → its category → itself.
 *
 * The last step is the page you are on, so it is plain text with
 * `aria-current` rather than a link back to where you already are.
 */
export type Crumb = { label: string; categorySlug?: string; home?: boolean }

export function DirectoryBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {last ? (
                <span aria-current="page" className="text-foreground">
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
  const className = `rounded-sm hover:text-foreground ${focusRing}`

  if (crumb.home) {
    return (
      <Link to="/" className={className}>
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
