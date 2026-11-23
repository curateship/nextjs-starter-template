import { ExternalLinkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The icon beside a record window's title that opens that record's public page.
 *
 * One component for the four windows that own a public page: listings, events,
 * posts and deals. The question is the same question in each, and four copies
 * would answer it four slightly different ways.
 *
 * Two things it deliberately does not do. It never points at the address
 * currently typed in the form, only at the one already saved: a slug edited and
 * not yet saved would open a page that does not exist. And it never sits greyed
 * out on a draft. A draft's public address answers "not found" to everybody,
 * admin included, so pressing it says why in a toast instead of opening a tab
 * on a dead end.
 */
export function RecordPreviewLink({
  /** The saved public path, like `/directory/joes-diner`. Null before a save. */
  path,
  published,
  /** The word for this kind of record, for the tooltip and the toast. */
  word,
}: {
  path: string | null
  published: boolean
  word: string
}) {
  if (!path) return null

  const label = `Open this ${word}'s public page in a new tab`

  if (!published) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={() =>
              showErrorToast(
                `A draft has no public page. Publish the ${word} and the link opens it.`
              )
            }
          >
            <ExternalLinkIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Not public until it is published</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon-sm">
          <a href={path} target="_blank" rel="noreferrer" aria-label={label}>
            <ExternalLinkIcon className="size-4" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>View the page</TooltipContent>
    </Tooltip>
  )
}
