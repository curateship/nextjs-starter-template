import * as React from "react"
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category } from "@/lib/api/directory/categories"
import {
  DIRECTORY_CATEGORY_SOURCES,
  DIRECTORY_CATEGORY_SOURCE_HINTS,
  DIRECTORY_CATEGORY_SOURCE_LABELS,
  MAX_DIRECTORY_CATEGORY_CARDS,
  type DirectoryCategorySource,
} from "@/lib/directory/category-cards"

/**
 * Which categories a row of cards shows: the top-level ones, or a hand-picked
 * set in a chosen order.
 *
 * One picker, used in both places a row can go — a home page row's window and
 * the browse page's settings card — because the choice is the same choice. Two
 * copies would drift, and an admin would find the same question answered two
 * slightly different ways.
 *
 * The chosen ones are a list with up and down rather than a multi-select,
 * because the order is part of the answer and no multi-select can express it.
 */
export function CategoryPicker({
  idPrefix,
  categories,
  source,
  pickedIds,
  disabled = false,
  onSourceChange,
  onPickedChange,
}: {
  /** Keeps the labels' `htmlFor` unique when two pickers share a screen. */
  idPrefix: string
  categories: Category[]
  source: DirectoryCategorySource
  pickedIds: string[]
  disabled?: boolean
  onSourceChange: (source: DirectoryCategorySource) => void
  onPickedChange: (ids: string[]) => void
}) {
  const [adding, setAdding] = React.useState("")
  const byId = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  )

  const picked = pickedIds.filter((id) => byId.has(id))
  const available = categories.filter(
    (category) => !pickedIds.includes(category.id)
  )
  const full = picked.length >= MAX_DIRECTORY_CATEGORY_CARDS

  const move = (index: number, by: -1 | 1) => {
    const next = index + by
    if (next < 0 || next >= picked.length) return
    const order = [...picked]
    const [moved] = order.splice(index, 1)
    order.splice(next, 0, moved)
    onPickedChange(order)
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`${idPrefix}-source`}
          hint={DIRECTORY_CATEGORY_SOURCE_HINTS[source]}
        >
          Which categories
        </FieldLabel>
        <Select
          value={source}
          disabled={disabled}
          onValueChange={(value) =>
            onSourceChange(value as DirectoryCategorySource)
          }
        >
          <SelectTrigger
            id={`${idPrefix}-source`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTORY_CATEGORY_SOURCES.map((value) => (
              <SelectItem key={value} value={value}>
                {DIRECTORY_CATEGORY_SOURCE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {source === "picked" ? (
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`${idPrefix}-add`}
            hint="A category with nothing published under it is left off the page, however it was chosen."
          >
            Chosen categories
          </FieldLabel>

          {picked.length ? (
            <ul className="grid gap-2">
              {picked.map((id, index) => {
                const category = byId.get(id)
                const name = category?.name ?? "Unknown category"
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-md border p-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {name}
                    </span>
                    <div className="flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled || index === 0}
                        aria-label={`Move ${name} up`}
                        onClick={() => move(index, -1)}
                      >
                        <ChevronUpIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled || index === picked.length - 1}
                        aria-label={`Move ${name} down`}
                        onClick={() => move(index, 1)}
                      >
                        <ChevronDownIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        aria-label={`Remove ${name}`}
                        onClick={() =>
                          onPickedChange(picked.filter((entry) => entry !== id))
                        }
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              None chosen yet. Add the first one below.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={adding}
              disabled={disabled || full || available.length === 0}
              onValueChange={setAdding}
            >
              <SelectTrigger id={`${idPrefix}-add`} className="w-full sm:w-64">
                <SelectValue
                  placeholder={
                    available.length ? "Choose a category" : "All of them added"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {available.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DisabledReason
              disabled={full}
              reason={`A row shows at most ${MAX_DIRECTORY_CATEGORY_CARDS} cards. Remove one before adding another.`}
            >
              <Button
                type="button"
                variant="outline"
                disabled={disabled || full || !adding}
                onClick={() => {
                  if (!adding) return
                  onPickedChange([...picked, adding])
                  setAdding("")
                }}
              >
                <PlusIcon className="size-4" />
                Add
              </Button>
            </DisabledReason>
          </div>
        </div>
      ) : null}
    </div>
  )
}
