import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CategoryPicker } from "@/components/directory/category-picker"
import {
  cleanPickedCategoryIds,
  DIRECTORY_CATEGORY_PICK_MESSAGE,
  type DirectoryCategorySource,
} from "@/lib/directory/category-cards"
import {
  DIRECTORY_FRONT_PAGE_COUNT_DEFAULT,
  DIRECTORY_FRONT_PAGE_COUNT_MAX,
  DIRECTORY_FRONT_PAGE_COUNT_MESSAGE,
  DIRECTORY_FRONT_PAGE_COUNT_MIN,
  DIRECTORY_FRONT_PAGE_HEADING_MAX,
  DIRECTORY_FRONT_PAGE_HEADING_MESSAGE,
  DIRECTORY_FRONT_PAGE_INTRO_MAX,
  DIRECTORY_FRONT_PAGE_KINDS,
  DIRECTORY_FRONT_PAGE_KIND_HINTS,
  DIRECTORY_FRONT_PAGE_KIND_LABELS,
  DIRECTORY_FRONT_PAGE_LAYOUTS,
  DIRECTORY_FRONT_PAGE_LAYOUT_LABELS,
  DIRECTORY_FRONT_PAGE_SORTS,
  DIRECTORY_FRONT_PAGE_SORT_HINTS,
  DIRECTORY_FRONT_PAGE_SORT_LABELS,
  type DirectoryFrontPageKind,
  type DirectoryFrontPageLayout,
  type DirectoryFrontPageSection,
  type DirectoryFrontPageSort,
} from "@/lib/directory/front-page"
import type { Category } from "@/lib/api/directory/categories"
import {
  getFrontPageSectionErrorMessage,
  saveFrontPageSection,
  saveNewFrontPageSection,
} from "@/lib/api/directory/front-page-sections"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * One row of the home page, edited in a single window: what it is called, which
 * listings it holds, how many, and how they draw.
 *
 * The map choice is only in the list when this site can actually draw one — it
 * needs the map switched on and a browser map key saved. Offering a choice that
 * quietly turns into a grid would be worse than not offering it, so the reason
 * is said under the field instead.
 */

/** Every category is the empty filter, and a select cannot hold an empty value. */
const EVERY_CATEGORY = "all"

export function FrontPageSectionDialog({
  open,
  section,
  categories,
  mapAvailable,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The row being edited, or null when adding one. */
  section: DirectoryFrontPageSection | null
  categories: Category[]
  /** This site has the map switched on and a browser map key saved. */
  mapAvailable: boolean
  onClose: () => void
  onSaved: (saved: DirectoryFrontPageSection, wasNew: boolean) => void
}) {
  const [heading, setHeading] = React.useState("")
  const [intro, setIntro] = React.useState("")
  const [kind, setKind] = React.useState<DirectoryFrontPageKind>("listings")
  const [categorySource, setCategorySource] =
    React.useState<DirectoryCategorySource>("top-level")
  const [pickedIds, setPickedIds] = React.useState<string[]>([])
  const [categoryId, setCategoryId] = React.useState(EVERY_CATEGORY)
  const [sort, setSort] = React.useState<DirectoryFrontPageSort>("newest")
  const [count, setCount] = React.useState(
    String(DIRECTORY_FRONT_PAGE_COUNT_DEFAULT)
  )
  const [layout, setLayout] = React.useState<DirectoryFrontPageLayout>("grid")
  const [saving, setSaving] = React.useState(false)

  // Filled from the row every time the window opens, so a window reopened on a
  // different row never shows the last one's words.
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null)
  const key = open ? (section?.id ?? "new") : null
  if (loadedFor !== key) {
    setLoadedFor(key)
    setHeading(section?.heading ?? "")
    setIntro(section?.intro ?? "")
    setKind(section?.kind ?? "listings")
    setCategorySource(section?.categorySource ?? "top-level")
    setPickedIds(section?.pickedCategoryIds ?? [])
    setCategoryId(section?.categoryId ?? EVERY_CATEGORY)
    setSort(section?.sort ?? "newest")
    setCount(
      String(section?.listingCount ?? DIRECTORY_FRONT_PAGE_COUNT_DEFAULT)
    )
    setLayout(section?.layout ?? "grid")
  }

  const countNumber = Number(count)
  const countInvalid =
    !Number.isInteger(countNumber) ||
    countNumber < DIRECTORY_FRONT_PAGE_COUNT_MIN ||
    countNumber > DIRECTORY_FRONT_PAGE_COUNT_MAX

  const dirty =
    heading !== (section?.heading ?? "") ||
    intro !== (section?.intro ?? "") ||
    kind !== (section?.kind ?? "listings") ||
    categorySource !== (section?.categorySource ?? "top-level") ||
    pickedIds.join(",") !== (section?.pickedCategoryIds ?? []).join(",") ||
    categoryId !== (section?.categoryId ?? EVERY_CATEGORY) ||
    sort !== (section?.sort ?? "newest") ||
    count !==
      String(section?.listingCount ?? DIRECTORY_FRONT_PAGE_COUNT_DEFAULT) ||
    layout !== (section?.layout ?? "grid")

  // A row already saved as a map on a site that has since lost its key still
  // shows its own choice, so saving does not silently change it to a grid.
  const layouts = DIRECTORY_FRONT_PAGE_LAYOUTS.filter(
    (value) => value !== "map" || mapAvailable || section?.layout === "map"
  )

  const save = React.useCallback(async () => {
    if (!heading.trim()) {
      showErrorToast(DIRECTORY_FRONT_PAGE_HEADING_MESSAGE)
      return
    }
    if (countInvalid) {
      showErrorToast(DIRECTORY_FRONT_PAGE_COUNT_MESSAGE)
      return
    }

    if (
      kind === "categories" &&
      categorySource === "picked" &&
      cleanPickedCategoryIds(pickedIds).length === 0
    ) {
      showErrorToast(DIRECTORY_CATEGORY_PICK_MESSAGE)
      return
    }

    const values = {
      heading: heading.trim(),
      intro: intro.trim(),
      kind,
      categorySource,
      pickedCategoryIds: pickedIds,
      categoryId: categoryId === EVERY_CATEGORY ? null : categoryId,
      sort,
      listingCount: countNumber,
      layout,
    }

    setSaving(true)
    try {
      const saved = section
        ? await saveFrontPageSection({ id: section.id, ...values })
        : await saveNewFrontPageSection(values)
      dismissErrorToast()
      onSaved(saved, section === null)
    } catch (error) {
      showErrorToast(getFrontPageSectionErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [
    categoryId,
    categorySource,
    countInvalid,
    countNumber,
    heading,
    intro,
    kind,
    layout,
    onSaved,
    pickedIds,
    section,
    sort,
  ])

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {section ? heading.trim() || "Untitled row" : "New row"}
            </DialogTitle>
            <DialogDescription>
              A row on this site&apos;s home page: either listings, or a card per
              category with its photo and how many listings are under it.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>What it says</CardTitle>
                <CardDescription>
                  The heading visitors read above the row.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-section-kind"
                    hint={DIRECTORY_FRONT_PAGE_KIND_HINTS[kind]}
                  >
                    What the row shows
                  </FieldLabel>
                  <Select
                    value={kind}
                    disabled={saving}
                    onValueChange={(value) =>
                      setKind(value as DirectoryFrontPageKind)
                    }
                  >
                    <SelectTrigger
                      id="front-page-section-kind"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTORY_FRONT_PAGE_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {DIRECTORY_FRONT_PAGE_KIND_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="front-page-section-heading">
                    Heading
                  </FieldLabel>
                  <Input
                    id="front-page-section-heading"
                    value={heading}
                    maxLength={DIRECTORY_FRONT_PAGE_HEADING_MAX}
                    placeholder="New this week"
                    disabled={saving}
                    aria-invalid={heading.trim() === "" ? true : undefined}
                    onChange={(event) => setHeading(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-section-intro"
                    hint="One line under the heading. Leave it empty for no line at all."
                  >
                    Introduction
                  </FieldLabel>
                  <Textarea
                    id="front-page-section-intro"
                    value={intro}
                    maxLength={DIRECTORY_FRONT_PAGE_INTRO_MAX}
                    disabled={saving}
                    onChange={(event) => setIntro(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {kind === "categories" ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Which categories</CardTitle>
                  <CardDescription>
                    Each card shows the category&apos;s photo, its name, and how
                    many listings sit under it — including everything nested
                    beneath it.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <CategoryPicker
                    idPrefix="front-page-section"
                    categories={categories}
                    source={categorySource}
                    pickedIds={pickedIds}
                    disabled={saving}
                    onSourceChange={setCategorySource}
                    onPickedChange={setPickedIds}
                  />
                  <div className="grid max-w-40 gap-2">
                    <FieldLabel
                      htmlFor="front-page-section-count"
                      hint={`At most this many cards, between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
                    >
                      How many
                    </FieldLabel>
                    <Input
                      id="front-page-section-count"
                      type="number"
                      min={DIRECTORY_FRONT_PAGE_COUNT_MIN}
                      max={DIRECTORY_FRONT_PAGE_COUNT_MAX}
                      value={count}
                      disabled={saving}
                      aria-invalid={countInvalid || undefined}
                      onChange={(event) => setCount(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Which listings</CardTitle>
                <CardDescription>
                  {DIRECTORY_FRONT_PAGE_SORT_HINTS[sort]}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-section-category"
                    hint="A row whose category has nothing published in it is left off the page entirely."
                  >
                    Category
                  </FieldLabel>
                  <Select
                    value={categoryId}
                    disabled={saving}
                    onValueChange={setCategoryId}
                  >
                    <SelectTrigger
                      id="front-page-section-category"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EVERY_CATEGORY}>
                        Every category
                      </SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <FieldLabel htmlFor="front-page-section-sort">
                    Order
                  </FieldLabel>
                  <Select
                    value={sort}
                    disabled={saving}
                    onValueChange={(value) =>
                      setSort(value as DirectoryFrontPageSort)
                    }
                  >
                    <SelectTrigger
                      id="front-page-section-sort"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTORY_FRONT_PAGE_SORTS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {DIRECTORY_FRONT_PAGE_SORT_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid max-w-40 gap-2">
                  <FieldLabel
                    htmlFor="front-page-section-count"
                    hint={`Between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
                  >
                    How many
                  </FieldLabel>
                  <Input
                    id="front-page-section-count"
                    type="number"
                    min={DIRECTORY_FRONT_PAGE_COUNT_MIN}
                    max={DIRECTORY_FRONT_PAGE_COUNT_MAX}
                    value={count}
                    disabled={saving}
                    aria-invalid={countInvalid || undefined}
                    onChange={(event) => setCount(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>How it draws</CardTitle>
                <CardDescription>
                  {mapAvailable
                    ? "A map only plots listings that have a location."
                    : "The map choice appears once this site has the map switched on and a map key saved, under Map view above."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="front-page-section-layout">
                    Arrangement
                  </FieldLabel>
                  <Select
                    value={layout}
                    disabled={saving}
                    onValueChange={(value) =>
                      setLayout(value as DirectoryFrontPageLayout)
                    }
                  >
                    <SelectTrigger
                      id="front-page-section-layout"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {layouts.map((value) => (
                        <SelectItem key={value} value={value}>
                          {DIRECTORY_FRONT_PAGE_LAYOUT_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
              </>
            )}

          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {section ? "Save changes" : "Create row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
