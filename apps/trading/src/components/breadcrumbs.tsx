import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"

export type Crumb = {
  label: string
  /** Absolute path; the last crumb usually omits it (current page). */
  to?: string
}

/**
 * Drill-down breadcrumb trail rendered inside a dashboard toolbar title:
 * muted ancestor links › bold current page. Size inherits from the toolbar.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1
        return (
          <span
            key={`${crumb.label}-${index}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            {index > 0 ? (
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : null}
            {crumb.to && !last ? (
              <Link
                to={crumb.to}
                className="truncate font-normal text-muted-foreground hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={last ? "truncate font-semibold" : "truncate"}>
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
