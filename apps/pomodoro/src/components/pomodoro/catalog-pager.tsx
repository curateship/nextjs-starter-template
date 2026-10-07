import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { plural } from "@/lib/format/plural"

/**
 * The line under a picker's cards: "1–8 of 8 sounds" on the left and, once
 * there is a second page, Prev, the page numbers and Next on the right. Drawn
 * to Tyler's Sounds design of 7 Oct 2026; he asked for the same line on the
 * Theme page the same day.
 *
 * With one page the pager is not drawn at all, because it would be two
 * greyed-out arrows and a lone "1".
 */
export function CatalogPager({
  noun,
  total,
  first,
  shownCount,
  page,
  pages,
  onPage,
}: {
  /** What is being counted, singular: "sound", "background". */
  noun: string
  total: number
  first: number
  shownCount: number
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-xs text-muted-foreground">
        {first + 1}–{first + shownCount} of {total} {plural(total, noun)}
      </span>
      {pages > 1 ? (
        <nav
          aria-label={`Pages of ${plural(2, noun)}`}
          className="flex items-center gap-2"
        >
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            <ArrowLeftIcon aria-hidden="true" />
            Prev
          </Button>
          {Array.from({ length: pages }, (_, index) => (
            <Button
              key={index}
              variant={index === page ? "default" : "outline"}
              size="icon"
              aria-current={index === page ? "page" : undefined}
              aria-label={`Page ${index + 1}`}
              onClick={() => onPage(index)}
            >
              {index + 1}
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={page + 1 >= pages}
            onClick={() => onPage(page + 1)}
          >
            Next
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
