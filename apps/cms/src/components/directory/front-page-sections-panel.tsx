import * as React from "react"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { FrontPageSectionDialog } from "@/components/directory/front-page-section-dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  DIRECTORY_CATEGORY_SOURCE_LABELS,
} from "@/lib/directory/category-cards"
import {
  DIRECTORY_FRONT_PAGE_FULL_MESSAGE,
  DIRECTORY_FRONT_PAGE_KIND_LABELS,
  DIRECTORY_FRONT_PAGE_LAYOUT_LABELS,
  DIRECTORY_FRONT_PAGE_SORT_LABELS,
  MAX_DIRECTORY_FRONT_PAGE_SECTIONS,
  type DirectoryFrontPageSection,
} from "@/lib/directory/front-page"
import { loadCategories, type Category } from "@/lib/api/directory/categories"
import {
  getFrontPageSectionErrorMessage,
  loadFrontPageSections,
  removeFrontPageSection,
  saveFrontPageSectionOrder,
} from "@/lib/api/directory/front-page-sections"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The rows a site's home page is made of, in the order they are drawn.
 *
 * The order is the order they appear on the page, which is why nothing here
 * sorts: a sorted view of a hand-arranged list would show an arrangement nobody
 * chose, and the up and down buttons would then move rows somewhere other than
 * where they went.
 *
 * A site with no rows has no listings home page at all — the platform's own
 * front page answers instead, exactly as it did before this screen existed.
 */
export function FrontPageSectionsPanel({
  mapAvailable,
}: {
  /** This site has the map switched on and a browser map key saved. */
  mapAvailable: boolean
}) {
  const [sections, setSections] = React.useState<
    DirectoryFrontPageSection[] | null
  >(null)
  const [categories, setCategories] = React.useState<Category[]>([])
  const [editing, setEditing] = React.useState<{
    section: DirectoryFrontPageSection | null
  } | null>(null)
  const [confirm, setConfirm] =
    React.useState<DirectoryFrontPageSection | null>(null)
  const [run, busy] = useAsyncAction(getFrontPageSectionErrorMessage)

  const reload = React.useCallback(async () => {
    setSections(await loadFrontPageSections())
  }, [])

  React.useEffect(() => {
    void Promise.all([loadFrontPageSections(), loadCategories()])
      .then(([loadedSections, loadedCategories]) => {
        setSections(loadedSections)
        setCategories(loadedCategories)
      })
      .catch(() =>
        showErrorToast("The home page rows could not be loaded.")
      )
  }, [])

  const move = React.useCallback(
    (index: number, by: -1 | 1) => {
      if (!sections) return
      const next = index + by
      if (next < 0 || next >= sections.length) return
      const order = sections.map((section) => section.id)
      const [moved] = order.splice(index, 1)
      order.splice(next, 0, moved)
      // Moved on screen straight away, then confirmed by re-reading what was
      // saved — so a failed save cannot leave the list showing an order the
      // database does not have.
      setSections(
        order.flatMap((id) => sections.filter((section) => section.id === id))
      )
      void run(async () => {
        await saveFrontPageSectionOrder(order)
        await reload()
      })
    },
    [reload, run, sections]
  )

  const confirmDelete = React.useCallback(async () => {
    if (!confirm) return
    const done = await run(async () => {
      const { heading } = await removeFrontPageSection(confirm.id)
      await reload()
      toast.success(`${heading} was deleted.`)
    })
    if (done) setConfirm(null)
  }, [confirm, reload, run])

  if (!sections) return <LoadingRow label="Loading home page rows…" />

  const full = sections.length >= MAX_DIRECTORY_FRONT_PAGE_SECTIONS

  return (
    <>
      <div className="grid gap-4">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rows yet, so this site&apos;s home page is the platform&apos;s
            own. Add the first row to make it a listings page.
          </p>
        ) : (
          <ul className="grid gap-2">
            {sections.map((section, index) => (
              <li
                key={section.id}
                className="flex items-start gap-2 rounded-md border p-3"
              >
                <div className="grid min-w-0 flex-1 gap-1">
                  <button
                    type="button"
                    className="block min-w-0 truncate text-left text-sm font-medium hover:underline"
                    title={section.heading}
                    onClick={() => setEditing({ section })}
                  >
                    {section.heading}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {(section.kind === "categories"
                      ? [
                          DIRECTORY_FRONT_PAGE_KIND_LABELS[section.kind],
                          DIRECTORY_CATEGORY_SOURCE_LABELS[
                            section.categorySource
                          ],
                          `up to ${section.listingCount}`,
                        ]
                      : [
                          section.categoryName ?? "Every category",
                          DIRECTORY_FRONT_PAGE_SORT_LABELS[section.sort],
                          `${section.listingCount} ${plural(section.listingCount, "listing", "listings")}`,
                          DIRECTORY_FRONT_PAGE_LAYOUT_LABELS[section.layout],
                        ]
                    ).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy || index === 0}
                    aria-label={`Move ${section.heading} up`}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUpIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy || index === sections.length - 1}
                    aria-label={`Move ${section.heading} down`}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDownIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${section.heading}`}
                    onClick={() => setEditing({ section })}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`Delete ${section.heading}`}
                    onClick={() => setConfirm(section)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div>
          <DisabledReason
            disabled={full}
            reason={DIRECTORY_FRONT_PAGE_FULL_MESSAGE}
          >
            <Button
              type="button"
              variant="outline"
              disabled={full}
              onClick={() => setEditing({ section: null })}
            >
              <PlusIcon className="size-4" />
              Add row
            </Button>
          </DisabledReason>
        </div>
      </div>

      <FrontPageSectionDialog
        open={editing !== null}
        section={editing?.section ?? null}
        categories={categories}
        mapAvailable={mapAvailable}
        onClose={() => setEditing(null)}
        onSaved={(saved, wasNew) => {
          setEditing(null)
          void reload()
          toast.success(wasNew ? `${saved.heading} was created.` : "Row saved.")
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title="Delete this row?"
        description={
          confirm
            ? `${confirm.heading} comes off the home page. The listings in it are not touched.`
            : null
        }
        confirmLabel="Delete row"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
