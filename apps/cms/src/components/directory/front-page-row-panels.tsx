import * as React from "react"

import { CategoryPicker } from "@/components/directory/category-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { loadCategories, type Category } from "@/lib/api/directory/categories"
import type { AppFrontPageRowEditorProps } from "@/lib/app-options"
import {
  cleanCategoriesRowSettings,
  cleanListingsRowSettings,
  cleanPickedRowSettings,
} from "@/lib/directory/front-page-kinds"
import {
  DIRECTORY_FRONT_PAGE_COUNT_MAX,
  DIRECTORY_FRONT_PAGE_COUNT_MIN,
  DIRECTORY_FRONT_PAGE_LAYOUT_LABELS,
  DIRECTORY_FRONT_PAGE_LAYOUTS,
  DIRECTORY_FRONT_PAGE_SORT_HINTS,
  DIRECTORY_FRONT_PAGE_SORT_LABELS,
  DIRECTORY_FRONT_PAGE_SORTS,
} from "@/lib/directory/front-page"
import {
  PUBLIC_GRID_COLUMNS_AUTO,
  PUBLIC_GRID_COLUMNS_MAX,
} from "@/lib/layout/grid-columns"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The fields behind each of CMS's own front page rows, inside the shell's row
 * window.
 *
 * One file for all five, because they share the category picker, the "how many"
 * box and the loading of this site's categories. The shell hands each panel the
 * row's saved fields and takes back a whole new set, so nothing here knows how
 * the row is stored.
 *
 * Every panel cleans what it is given on the way in and writes a complete set
 * on the way out, so a row hand-edited in the settings row, or saved before a
 * field existed, still opens with something sensible in every box.
 */

/** Every category is the empty filter, and a select cannot hold an empty value. */
const EVERY = "all"

/** "The grid decides" is stored as 0, and a select cannot hold a number. */
const AUTO_COLUMNS = "auto"

/**
 * This site's categories, loaded once per window rather than once per panel.
 * Switching a row from listings to events must not fetch them again.
 */
function useSiteCategories() {
  const [categories, setCategories] = React.useState<Category[]>([])

  React.useEffect(() => {
    let alive = true
    void loadCategories()
      .then((loaded) => {
        if (alive) setCategories(loaded)
      })
      .catch(() => showErrorToast("The categories could not be loaded."))
    return () => {
      alive = false
    }
  }, [])

  return categories
}

function CountField({
  id,
  value,
  disabled,
  hint,
  onChange,
}: {
  id: string
  value: number
  disabled: boolean
  hint: string
  onChange: (count: number) => void
}) {
  return (
    <div className="grid max-w-40 gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        How many
      </FieldLabel>
      <Input
        id={id}
        type="number"
        min={DIRECTORY_FRONT_PAGE_COUNT_MIN}
        max={DIRECTORY_FRONT_PAGE_COUNT_MAX}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

/**
 * How many cards the row puts on one line. Offered on every row that draws a
 * grid of cards, because a row of three posts and a row of three listings
 * under it should be able to line up.
 */
function ColumnsField({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string
  value: number
  disabled: boolean
  onChange: (columns: number) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor={id}
        hint="At most this many on one line. A phone always draws one card per line, whatever this says."
      >
        Columns
      </FieldLabel>
      <Select
        value={
          value === PUBLIC_GRID_COLUMNS_AUTO ? AUTO_COLUMNS : String(value)
        }
        disabled={disabled}
        onValueChange={(next) =>
          onChange(
            next === AUTO_COLUMNS ? PUBLIC_GRID_COLUMNS_AUTO : Number(next)
          )
        }
      >
        <SelectTrigger id={id} className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_COLUMNS}>Fit the screen</SelectItem>
          {Array.from({ length: PUBLIC_GRID_COLUMNS_MAX }, (_, index) => (
            <SelectItem key={index + 1} value={String(index + 1)}>
              {index + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function CategoryField({
  id,
  value,
  categories,
  disabled,
  hint,
  everyLabel,
  onChange,
}: {
  id: string
  value: string | null
  categories: Category[]
  disabled: boolean
  hint: string
  everyLabel: string
  onChange: (categoryId: string | null) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        Category
      </FieldLabel>
      <Select
        value={value ?? EVERY}
        disabled={disabled}
        onValueChange={(next) => onChange(next === EVERY ? null : next)}
      >
        <SelectTrigger id={id} className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EVERY}>{everyLabel}</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ListingsRowPanel({
  settings,
  disabled,
  onChange,
}: AppFrontPageRowEditorProps) {
  const categories = useSiteCategories()
  const row = cleanListingsRowSettings(settings)

  return (
    <>
      <CategoryField
        id="front-page-row-listings-category"
        value={row.categoryId}
        categories={categories}
        disabled={disabled}
        hint="A row whose category has nothing published in it is left off the page entirely."
        everyLabel="Every category"
        onChange={(categoryId) => onChange({ ...row, categoryId })}
      />

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="front-page-row-listings-sort"
          hint={DIRECTORY_FRONT_PAGE_SORT_HINTS[row.sort]}
        >
          Order
        </FieldLabel>
        <Select
          value={row.sort}
          disabled={disabled}
          onValueChange={(sort) =>
            onChange({ ...row, sort: sort as typeof row.sort })
          }
        >
          <SelectTrigger
            id="front-page-row-listings-sort"
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

      <CountField
        id="front-page-row-listings-count"
        value={row.count}
        disabled={disabled}
        hint={`Between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
        onChange={(count) => onChange({ ...row, count })}
      />

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="front-page-row-listings-layout"
          hint="A map only plots listings that have a location, and it needs this site's map key. Without one the row draws as a grid."
        >
          Arrangement
        </FieldLabel>
        <Select
          value={row.layout}
          disabled={disabled}
          onValueChange={(layout) =>
            onChange({ ...row, layout: layout as typeof row.layout })
          }
        >
          <SelectTrigger
            id="front-page-row-listings-layout"
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTORY_FRONT_PAGE_LAYOUTS.map((value) => (
              <SelectItem key={value} value={value}>
                {DIRECTORY_FRONT_PAGE_LAYOUT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* One card per line and a map have no columns, so the box is left out
          rather than sitting there greyed. The saved number is kept either
          way, so switching back to a grid brings it back. */}
      {row.layout === "grid" ? (
        <ColumnsField
          id="front-page-row-listings-columns"
          value={row.columns}
          disabled={disabled}
          onChange={(columns) => onChange({ ...row, columns })}
        />
      ) : null}
    </>
  )
}

export function CategoriesRowPanel({
  settings,
  disabled,
  onChange,
}: AppFrontPageRowEditorProps) {
  const categories = useSiteCategories()
  const row = cleanCategoriesRowSettings(settings)

  return (
    <>
      <CategoryPicker
        idPrefix="front-page-row-categories"
        categories={categories}
        source={row.source}
        pickedIds={row.pickedCategoryIds}
        disabled={disabled}
        onSourceChange={(source) => onChange({ ...row, source })}
        onPickedChange={(pickedCategoryIds) =>
          onChange({ ...row, pickedCategoryIds })
        }
      />
      <CountField
        id="front-page-row-categories-count"
        value={row.count}
        disabled={disabled}
        hint={`At most this many cards, between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
        onChange={(count) => onChange({ ...row, count })}
      />
    </>
  )
}

/**
 * Events, deals and posts are the same panel with different words: a category
 * or every one of them, and how many.
 */
function PickedRowPanel({
  settings,
  disabled,
  onChange,
  idPrefix,
  categoryHint,
  everyLabel,
  plural,
}: AppFrontPageRowEditorProps & {
  idPrefix: string
  categoryHint: string
  everyLabel: string
  plural: string
}) {
  const categories = useSiteCategories()
  const row = cleanPickedRowSettings(settings)

  return (
    <>
      <CategoryField
        id={`${idPrefix}-category`}
        value={row.categoryId}
        categories={categories}
        disabled={disabled}
        hint={categoryHint}
        everyLabel={everyLabel}
        onChange={(categoryId) => onChange({ ...row, categoryId })}
      />
      <CountField
        id={`${idPrefix}-count`}
        value={row.count}
        disabled={disabled}
        hint={`At most this many ${plural}, between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
        onChange={(count) => onChange({ ...row, count })}
      />
      <ColumnsField
        id={`${idPrefix}-columns`}
        value={row.columns}
        disabled={disabled}
        onChange={(columns) => onChange({ ...row, columns })}
      />
    </>
  )
}

export function EventsRowPanel(props: AppFrontPageRowEditorProps) {
  return (
    <PickedRowPanel
      {...props}
      idPrefix="front-page-row-events"
      categoryHint="Only events filed under this category, not its subcategories."
      everyLabel="Every event"
      plural="events"
    />
  )
}

export function DealsRowPanel(props: AppFrontPageRowEditorProps) {
  return (
    <PickedRowPanel
      {...props}
      idPrefix="front-page-row-deals"
      categoryHint="Only deals at listings filed under this category, not its subcategories."
      everyLabel="Every deal"
      plural="deals"
    />
  )
}

export function PostsRowPanel(props: AppFrontPageRowEditorProps) {
  return (
    <PickedRowPanel
      {...props}
      idPrefix="front-page-row-posts"
      categoryHint="Only posts filed under this category, not its subcategories."
      everyLabel="Every post"
      plural="posts"
    />
  )
}
