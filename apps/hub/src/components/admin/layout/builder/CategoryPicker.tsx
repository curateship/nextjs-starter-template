"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronRight, ChevronsUpDown, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getCategoriesForSiteAction,
  createCategoryAction,
  type Category,
} from "@/lib/actions/categories/category-actions"
import { cn } from "@/lib/utils/tailwind"

interface CategoryPickerProps {
  siteId: string
  selectedCategoryIds: string[]
  onSelectionChange: (categoryIds: string[]) => void
  primaryCategoryId?: string | null
  onPrimaryCategoryChange?: (categoryId: string | null) => void
  loadingSelectedCategories?: boolean
  selectedCategoryDetails?: Array<{ id: string; title: string }>
  variant?: "default" | "combobox"
}

interface ParentCategorySelectProps {
  parent: Category
  childOptions: Category[]
  selectedIds: string[]
  compact: boolean
  onToggleChild: (categoryId: string) => void
  onCreateChild: (parent: Category, title: string) => Promise<boolean>
}

function isCategoryPublished(category: Category) {
  return (category.is_published ?? (category as Category & { isPublished?: boolean }).isPublished) === true
}

function getCategoryParentId(category: Category) {
  return category.parent_id ?? (category as Category & { parentId?: string | null }).parentId ?? null
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function CategoryPath({ parts }: { parts: string[] }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="inline-flex min-w-0 items-center gap-1">
          {index > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
          <span className="truncate">{part}</span>
        </span>
      ))}
    </span>
  )
}

async function getAllCategoriesForSite(siteId: string) {
  const pageSize = 100
  let page = 1
  let total = 0
  const allCategories: Category[] = []

  do {
    const { data, total: categoryTotal } = await getCategoriesForSiteAction(siteId, { page, pageSize })
    if (!data || data.length === 0) break

    allCategories.push(...data)
    total = categoryTotal
    page += 1
  } while (allCategories.length < total)

  return allCategories
}

function ParentCategorySelect({
  parent,
  childOptions,
  selectedIds,
  compact,
  onToggleChild,
  onCreateChild,
}: ParentCategorySelectProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newChildTitle, setNewChildTitle] = useState("")
  const [creating, setCreating] = useState(false)

  const selectedChildren = childOptions.filter((child) => selectedIds.includes(child.id))
  const filteredChildren = useMemo(() => {
    if (!searchQuery.trim()) return childOptions
    const query = searchQuery.toLowerCase()
    return childOptions.filter((child) => child.title.toLowerCase().includes(query))
  }, [childOptions, searchQuery])

  const handleCreateChild = async () => {
    const title = newChildTitle.trim()
    if (!title) return

    setCreating(true)
    try {
      const created = await onCreateChild(parent, title)
      if (!created) return

      setNewChildTitle("")
      setShowCreateInput(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{parent.title}</div>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={`category-options-${parent.id}`}
            tabIndex={0}
            className={cn(
              "border-input flex min-h-10 w-full cursor-text flex-wrap items-center gap-1 rounded-md border bg-transparent text-sm outline-none transition-[color,box-shadow] hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              compact ? "px-2 py-1" : "px-3 py-2"
            )}
          >
            {selectedChildren.length > 0 ? (
              selectedChildren.map((child) => (
                <Badge key={child.id} variant="secondary" className="max-w-full gap-1 pr-1">
                  <span className="truncate">{child.title}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onToggleChild(child.id)
                    }}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="px-1 text-muted-foreground">Select {parent.title}...</span>
            )}
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${parent.title}...`}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList id={`category-options-${parent.id}`}>
              {filteredChildren.length === 0 && !showCreateInput ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No child categories found.
                </div>
              ) : (
                <CommandGroup>
                  {filteredChildren.map((child) => {
                    const selected = selectedIds.includes(child.id)

                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onToggleChild(child.id)}
                        className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      >
                        <Check
                          className={cn(
                            "h-4 w-4",
                            selected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate">{child.title}</span>
                      </button>
                    )
                  })}
                </CommandGroup>
              )}

              <div className="border-t p-2">
                {showCreateInput ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newChildTitle}
                      onChange={(event) => setNewChildTitle(event.target.value)}
                      placeholder={`New ${parent.title} category`}
                      className="h-8 text-sm"
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          handleCreateChild()
                        }
                        if (event.key === "Escape") {
                          setShowCreateInput(false)
                          setNewChildTitle("")
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-3"
                      onClick={handleCreateChild}
                      disabled={creating || !newChildTitle.trim()}
                    >
                      {creating ? "..." : "Add"}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCreateInput(true)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Create under {parent.title}
                  </button>
                )}
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function CategoryPicker({
  siteId,
  selectedCategoryIds,
  onSelectionChange,
  primaryCategoryId,
  onPrimaryCategoryChange,
  loadingSelectedCategories = false,
  selectedCategoryDetails = [],
  variant = "default",
}: CategoryPickerProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)

  useEffect(() => {
    if (!siteId) return

    let cancelled = false
    setLoading(true)
    setCategoriesLoaded(false)
    getAllCategoriesForSite(siteId)
      .then((data) => {
        if (cancelled) return
        setCategories(data)
      })
      .catch(() => {
        if (cancelled) return
        setCategories([])
      })
      .finally(() => {
        if (cancelled) return
        setCategoriesLoaded(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [siteId])

  const publishedCategories = useMemo(
    () => categories.filter(isCategoryPublished),
    [categories]
  )

  const topLevelCategories = useMemo(
    () => publishedCategories.filter((category) => !getCategoryParentId(category)),
    [publishedCategories]
  )

  const childCategories = useMemo(
    () => publishedCategories.filter((category) => getCategoryParentId(category)),
    [publishedCategories]
  )

  const childCategoryIds = useMemo(
    () => new Set(childCategories.map((category) => category.id)),
    [childCategories]
  )

  const validSelectedCategoryIds = useMemo(
    () => selectedCategoryIds.filter((id) => childCategoryIds.has(id)),
    [childCategoryIds, selectedCategoryIds]
  )

  useEffect(() => {
    if (!categoriesLoaded || loading) return
    if (areStringArraysEqual(selectedCategoryIds, validSelectedCategoryIds)) return

    onSelectionChange(validSelectedCategoryIds)
  }, [
    categoriesLoaded,
    loading,
    onSelectionChange,
    selectedCategoryIds,
    validSelectedCategoryIds,
  ])

  useEffect(() => {
    if (!categoriesLoaded || loading || !onPrimaryCategoryChange) return

    if (validSelectedCategoryIds.length === 0) {
      if (primaryCategoryId) onPrimaryCategoryChange(null)
      return
    }

    if (!primaryCategoryId || !validSelectedCategoryIds.includes(primaryCategoryId)) {
      onPrimaryCategoryChange(validSelectedCategoryIds[0])
    }
  }, [
    categoriesLoaded,
    loading,
    onPrimaryCategoryChange,
    primaryCategoryId,
    validSelectedCategoryIds,
  ])

  const categoriesByParentId = useMemo(() => {
    const map = new Map<string, Category[]>()
    childCategories.forEach((category) => {
      const parentId = getCategoryParentId(category)
      if (!parentId) return
      const parentChildren = map.get(parentId) || []
      parentChildren.push(category)
      map.set(parentId, parentChildren)
    })
    return map
  }, [childCategories])

  const categoryPathPartsMap = useMemo(() => {
    const map = new Map<string, string[]>()
    const categoryMap = new Map(categories.map((category) => [category.id, category]))

    const getPathParts = (category: Category): string[] => {
      if (map.has(category.id)) return map.get(category.id)!

      const parentId = getCategoryParentId(category)
      if (!parentId) {
        const pathParts = [category.title]
        map.set(category.id, pathParts)
        return pathParts
      }

      const parent = categoryMap.get(parentId)
      const pathParts = parent ? [...getPathParts(parent), category.title] : [category.title]
      map.set(category.id, pathParts)
      return pathParts
    }

    categories.forEach(getPathParts)
    return map
  }, [categories])

  const selectedDetailMap = useMemo(() => {
    return new Map(selectedCategoryDetails.map((category) => [category.id, category.title]))
  }, [selectedCategoryDetails])

  const selectedChildLabels = validSelectedCategoryIds.map((id) => ({
    id,
    label: (categoryPathPartsMap.get(id) || [selectedDetailMap.get(id) || "Category"]).join(" > "),
    pathParts: categoryPathPartsMap.get(id) || [selectedDetailMap.get(id) || "Category"],
  }))

  const selectedBreadcrumbId =
    primaryCategoryId && validSelectedCategoryIds.includes(primaryCategoryId)
      ? primaryCategoryId
      : validSelectedCategoryIds[0]

  const selectedIdsByParentId = useMemo(() => {
    const map = new Map<string, string[]>()
    validSelectedCategoryIds.forEach((categoryId) => {
      const category = childCategories.find((child) => child.id === categoryId)
      const parentId = category ? getCategoryParentId(category) : null
      if (!parentId) return
      const selectedIds = map.get(parentId) || []
      selectedIds.push(categoryId)
      map.set(parentId, selectedIds)
    })
    return map
  }, [childCategories, validSelectedCategoryIds])

  const showSelectedCategorySkeleton =
    loadingSelectedCategories ||
    (selectedCategoryIds.length > 0 && (!categoriesLoaded || loading))

  const toggleChildCategory = (categoryId: string) => {
    if (!childCategoryIds.has(categoryId)) return

    const nextCategoryIds = validSelectedCategoryIds.includes(categoryId)
      ? validSelectedCategoryIds.filter((id) => id !== categoryId)
      : [...validSelectedCategoryIds, categoryId]

    onSelectionChange(nextCategoryIds)

    if (primaryCategoryId === categoryId) {
      onPrimaryCategoryChange?.(nextCategoryIds[0] || null)
    } else if (!primaryCategoryId && nextCategoryIds.length > 0) {
      onPrimaryCategoryChange?.(nextCategoryIds[0])
    }
  }

  const handleCreateChildCategory = async (parent: Category, title: string) => {
    if (!siteId) return false

    const { data } = await createCategoryAction(siteId, {
      title,
      parent_id: parent.id,
      is_published: true,
    })

    if (!data) return false

    setCategories((prev) => [...prev, data])
    const nextCategoryIds = [...validSelectedCategoryIds, data.id]
    onSelectionChange(nextCategoryIds)
    if (!primaryCategoryId) {
      onPrimaryCategoryChange?.(data.id)
    }
    return true
  }

  if (loading || !categoriesLoaded) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        {showSelectedCategorySkeleton && (
          <Skeleton className="h-6 w-32 rounded-full" />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {topLevelCategories.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
          No parent categories found.
        </div>
      ) : (
        <div className="grid gap-3">
          {topLevelCategories.map((parent) => (
            <ParentCategorySelect
              key={parent.id}
              parent={parent}
              childOptions={categoriesByParentId.get(parent.id) || []}
              selectedIds={selectedIdsByParentId.get(parent.id) || []}
              compact={variant === "combobox"}
              onToggleChild={toggleChildCategory}
              onCreateChild={handleCreateChildCategory}
            />
          ))}
        </div>
      )}

      {onPrimaryCategoryChange && selectedChildLabels.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Frontend breadcrumb</div>
          <Select
            value={selectedBreadcrumbId}
            onValueChange={onPrimaryCategoryChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select breadcrumb category" />
            </SelectTrigger>
            <SelectContent>
              {selectedChildLabels.map((category) => (
                <SelectItem key={category.id} value={category.id} textValue={category.label}>
                  <CategoryPath parts={category.pathParts} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
