import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  GripVerticalIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { FrontPageSectionDialog } from "@/components/directory/front-page-section-dialog"
import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { DIRECTORY_CATEGORY_SOURCE_LABELS } from "@/lib/directory/category-cards"
import {
  DIRECTORY_FRONT_PAGE_KIND_LABELS,
  DIRECTORY_FRONT_PAGE_LAYOUT_LABELS,
  DIRECTORY_FRONT_PAGE_SORT_LABELS,
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

/** What a row filtered to no category says it shows, one word per kind. */
const EVERY_LABELS = {
  events: "Every event",
  deals: "Every deal",
  posts: "Every post",
} as const

/**
 * The one line under a row's heading in the list: what kind of row it is and the
 * two or three things that decide what lands in it.
 */
function summaryFor(section: DirectoryFrontPageSection): string[] {
  const label = DIRECTORY_FRONT_PAGE_KIND_LABELS[section.kind]
  // Said only when it is on. Every row was left before this existed, so "left"
  // on every line would be noise on the one thing that is always true.
  const where = section.centred ? ["centred"] : []

  if (section.kind === "hero") {
    return [
      label,
      section.hero.image ? "with a picture" : "words only",
      ...(section.hero.buttonLabel ? [section.hero.buttonLabel] : []),
      ...where,
    ]
  }
  if (section.kind === "plans") return [label, "the plans on sale", ...where]
  if (
    section.kind === "events" ||
    section.kind === "deals" ||
    section.kind === "posts"
  ) {
    return [
      label,
      section.categoryName ?? EVERY_LABELS[section.kind],
      `up to ${section.listingCount}`,
      ...where,
    ]
  }
  if (section.kind === "categories") {
    return [
      label,
      DIRECTORY_CATEGORY_SOURCE_LABELS[section.categorySource],
      `up to ${section.listingCount}`,
      ...where,
    ]
  }
  return [
    section.categoryName ?? "Every category",
    DIRECTORY_FRONT_PAGE_SORT_LABELS[section.sort],
    `${section.listingCount} ${plural(section.listingCount, "listing", "listings")}`,
    DIRECTORY_FRONT_PAGE_LAYOUT_LABELS[section.layout],
    ...where,
  ]
}

/**
 * What counts as something inside the row rather than the row itself. A click
 * on one of these is that control's click, not a request to open the row.
 */
const ROW_CONTROLS = "a, button, input, select, textarea, [role='menuitem']"

/**
 * One row in the list: its grab handle, what it says, and the two buttons.
 *
 * The handle is the shell's, the same one the public front page's rows and the
 * navigation editors use, so every draggable list in the app is grabbed the
 * same way. A drag only starts after the pointer has travelled 8px, so clicking
 * the heading still opens the row.
 *
 * **Anywhere on the row opens it**, the way a table row opens its record, so
 * the empty space beside a short heading is a target too. The handle and the
 * two buttons keep their own jobs, and the heading stays a real button so the
 * keyboard can reach it and press it.
 */
function SectionRow({
  section,
  busy,
  onEdit,
  onDelete,
}: {
  section: DirectoryFrontPageSection
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    section.id,
    true
  )

  const openFromRow = (event: React.MouseEvent<HTMLLIElement>) => {
    const target = event.target as HTMLElement
    if (target.closest(ROW_CONTROLS)) return
    // Dragging across the heading to copy it is not a click on the row.
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    onEdit()
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      // `bg-muted` rather than a named grey: it is the same light grey the
      // rest of the app hovers with, and it follows a site's own styling.
      className="flex cursor-pointer items-start gap-2 rounded-md border bg-background p-3 transition-colors hover:bg-muted"
      onClick={openFromRow}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={DRAG_HANDLE_CLASS}
        aria-label={`Reorder ${section.heading}`}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="grid min-w-0 flex-1 gap-1">
        <button
          type="button"
          className="block min-w-0 truncate text-left text-sm font-medium"
          title={section.heading}
          onClick={onEdit}
        >
          {section.heading}
        </button>
        <p className="text-xs text-muted-foreground">
          {summaryFor(section).join(" · ")}
        </p>
      </div>
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Edit ${section.heading}`}
          onClick={onEdit}
        >
          <SettingsIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={`Delete ${section.heading}`}
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </li>
  )
}

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
  const sensors = useNavSensors()

  const reload = React.useCallback(async () => {
    setSections(await loadFrontPageSections())
  }, [])

  React.useEffect(() => {
    void Promise.all([loadFrontPageSections(), loadCategories()])
      .then(([loadedSections, loadedCategories]) => {
        setSections(loadedSections)
        setCategories(loadedCategories)
      })
      .catch(() => showErrorToast("The home page rows could not be loaded."))
  }, [])

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      if (!sections || !event.over || event.active.id === event.over.id) return
      const ids = sections.map((section) => section.id)
      const from = ids.indexOf(String(event.active.id))
      const to = ids.indexOf(String(event.over.id))
      if (from === -1 || to === -1) return

      // Moved on screen straight away, then confirmed by re-reading what was
      // saved — so a failed save cannot leave the list showing an order the
      // database does not have.
      const moved = arrayMove(sections, from, to)
      setSections(moved)
      void run(async () => {
        await saveFrontPageSectionOrder(moved.map((section) => section.id))
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

  return (
    <>
      <div className="grid gap-4">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rows yet, so this site&apos;s home page is the platform&apos;s
            own. Add the first row to make it a listings page.
          </p>
        ) : (
          <DndContext
            id="cms-front-page-sections"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((section) => section.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="grid gap-2">
                {sections.map((section) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    busy={busy}
                    onEdit={() => setEditing({ section })}
                    onDelete={() => setConfirm(section)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing({ section: null })}
          >
            <PlusIcon className="size-4" />
            Add row
          </Button>
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
