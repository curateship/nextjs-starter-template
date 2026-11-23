import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"

import { publicContentAlignmentRowClassName } from "@/components/shell/public-content-alignment"
import { toLinkProps } from "@/lib/nav/nav-href"
import { cn } from "@/lib/utils"
import type { PublicBreadcrumbItem } from "@/lib/pages/public-breadcrumbs"

/** The trail itself, drawn only when the page's kind is switched on. */
export function PublicBreadcrumbs({
  trail,
}: {
  trail: PublicBreadcrumbItem[]
}) {
  if (trail.length < 2) return null

  return (
    <nav aria-label="Breadcrumb" className="w-full">
      <ol
        className={cn(
          "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground",
          publicContentAlignmentRowClassName
        )}
      >
        {trail.map((step, index) => {
          const last = index === trail.length - 1
          return (
            // `min-w-0` here and `wrap-anywhere` on the title below, so a
            // long page title can shrink this step below its own text width
            // and break mid-word if it has to. Without both, a long title
            // keeps its full width and pushes the page sideways on a phone.
            // `break-words` is not enough on its own, because it leaves a
            // single long word's minimum width as the whole word.
            <li
              key={`${step.label}-${index}`}
              className="flex min-w-0 items-center gap-x-1.5"
            >
              {index > 0 ? (
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-60"
                />
              ) : null}
              {step.href && !last ? (
                <Link
                  {...toLinkProps(step.href)}
                  className="transition-colors hover:text-foreground"
                >
                  {step.label}
                </Link>
              ) : (
                <span
                  className="min-w-0 wrap-anywhere text-foreground"
                  aria-current={last ? "page" : undefined}
                >
                  {step.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
