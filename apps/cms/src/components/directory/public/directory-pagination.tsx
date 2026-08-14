import { Button } from "@/components/ui/button"

/**
 * Previous / next under a public list, with a plain count between them.
 *
 * Not the dashboard's pagination: that one has first and last jumps, a rows
 * summary and a page-size control, all of which are an admin's tools for
 * working through a table. A visitor needs to know where they are and how to
 * go on.
 *
 * It draws nothing at all when everything fits on one page, rather than a pair
 * of dead buttons.
 */
export function DirectoryPagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: {
  page: number
  pageSize: number
  total: number
  hrefForPage: (page: number) => string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null

  const current = Math.min(Math.max(page, 1), pages)

  return (
    <nav
      aria-label="Listing pages"
      className="flex items-center justify-center gap-2"
    >
      {current === 1 ? (
        <Button type="button" variant="outline" disabled>
          Previous
        </Button>
      ) : (
        <Button asChild variant="outline">
          <a href={hrefForPage(current - 1)}>Previous</a>
        </Button>
      )}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        Page {current} of {pages}
      </p>
      {current === pages ? (
        <Button type="button" variant="outline" disabled>
          Next
        </Button>
      ) : (
        <Button asChild variant="outline">
          <a href={hrefForPage(current + 1)}>Next</a>
        </Button>
      )}
    </nav>
  )
}
