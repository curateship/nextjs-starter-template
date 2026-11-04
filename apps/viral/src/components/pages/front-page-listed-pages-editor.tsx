import { InspectorCard } from "@/components/shared/inspector-card"
import { Checkbox } from "@/components/ui/checkbox"
import { MAX_FRONT_PAGE_LISTED_PAGES } from "@/lib/pages/front-page"
import {
  PAGE_VISIBILITY_LABELS,
  type PageVisibility,
} from "@/lib/pages/page-visibility"

/** One page a Pages list block may show, as the editor offers it. */
export type FrontPageListedPageChoice = {
  id: string
  title: string
  path: string
  visibility: PageVisibility
}

/**
 * Which pages a Pages list block shows: every page an admin added to this
 * site, each with a tick.
 *
 * **Only added pages are on offer.** They are the ones with a picture and a
 * description to put on a card. A page the code declares, such as Pricing, has
 * neither.
 *
 * **The cards follow this list's order**, which is the Pages screen's own order
 * by address, so there is one order to learn and nothing to drag. Ticking a
 * page puts it in its place in that order rather than at the end.
 *
 * A page that is switched off or members-only can still be ticked, and says so
 * beside its name. Its card is left off the page for anybody who could not open
 * it, and comes back by itself when the page is switched on.
 */
export function FrontPageListedPagesEditor({
  choices,
  pageIds,
  onChange,
}: {
  choices: readonly FrontPageListedPageChoice[]
  pageIds: readonly string[]
  onChange: (pageIds: string[]) => void
}) {
  const chosen = new Set(pageIds)
  // Counted against the pages on offer, not the saved ids: an id left behind
  // by a deleted page is dropped on the next tick, and counting it here would
  // grey out a box the admin is entitled to tick.
  const full =
    choices.filter((page) => chosen.has(page.id)).length >=
    MAX_FRONT_PAGE_LISTED_PAGES

  function toggle(id: string, on: boolean) {
    const next = new Set(chosen)
    if (on) next.add(id)
    else next.delete(id)
    // Rebuilt from the list, so the saved order is the order on screen. An id
    // the list no longer offers is a page that was deleted, and it goes here.
    onChange(choices.filter((page) => next.has(page.id)).map((page) => page.id))
  }

  return (
    <InspectorCard
      storageId="front-page-row-listed-pages"
      title="Pages"
      description={`Tick the pages to show as cards, up to ${MAX_FRONT_PAGE_LISTED_PAGES}. Each card shows the page's picture, its name and its description, which are set in that page's own Page settings.`}
    >
      {choices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This site has no pages of its own yet. Add one on the Pages screen and
          it will be listed here.
        </p>
      ) : (
        // No scroller of its own: the panel around it already scrolls, and a
        // second one inside it is a list that traps the wheel.
        <ul className="grid overflow-hidden rounded-md border bg-background">
          {choices.map((page) => {
            const ticked = chosen.has(page.id)
            const id = `front-page-listed-page-${page.id}`
            return (
              <li key={page.id} className="border-b last:border-b-0">
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    id={id}
                    checked={ticked}
                    disabled={!ticked && full}
                    onCheckedChange={(next) => toggle(page.id, next === true)}
                  />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">
                      {page.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {page.path}
                      {page.visibility === "everyone"
                        ? null
                        : ` · ${PAGE_VISIBILITY_LABELS[page.visibility]}`}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </InspectorCard>
  )
}
