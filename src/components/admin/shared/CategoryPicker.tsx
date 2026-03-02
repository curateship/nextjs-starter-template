"use client"

import { useState, useEffect, useMemo } from "react"
import { Check, ChevronsUpDown, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  getCategoriesForSiteAction,
  createCategoryAction,
  type Category,
} from "@/lib/actions/categories/category-actions"

interface CategoryPickerProps {
  siteId: string
  selectedCategoryIds: string[]
  onSelectionChange: (categoryIds: string[]) => void
}

export function CategoryPicker({
  siteId,
  selectedCategoryIds,
  onSelectionChange,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newCategoryTitle, setNewCategoryTitle] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    getCategoriesForSiteAction(siteId).then(({ data }) => {
      if (data) setCategories(data)
      setLoading(false)
    })
  }, [siteId])

  const categoryPathMap = useMemo(() => {
    const map = new Map<string, string>()
    const getPath = (cat: Category): string => {
      if (map.has(cat.id)) return map.get(cat.id)!
      if (!cat.parent_id) {
        map.set(cat.id, cat.title)
        return cat.title
      }
      const parent = categories.find((c) => c.id === cat.parent_id)
      if (!parent) {
        map.set(cat.id, cat.title)
        return cat.title
      }
      const path = `${getPath(parent)} > ${cat.title}`
      map.set(cat.id, path)
      return path
    }
    categories.forEach(getPath)
    return map
  }, [categories])

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories
    const query = searchQuery.toLowerCase()
    return categories.filter((cat) => {
      const path = categoryPathMap.get(cat.id) || cat.title
      return (
        cat.title.toLowerCase().includes(query) ||
        path.toLowerCase().includes(query)
      )
    })
  }, [categories, searchQuery, categoryPathMap])

  const toggleCategory = (categoryId: string) => {
    if (selectedCategoryIds.includes(categoryId)) {
      onSelectionChange(selectedCategoryIds.filter((id) => id !== categoryId))
    } else {
      onSelectionChange([...selectedCategoryIds, categoryId])
    }
  }

  const removeCategory = (categoryId: string) => {
    onSelectionChange(selectedCategoryIds.filter((id) => id !== categoryId))
  }

  const handleCreateCategory = async () => {
    const title = newCategoryTitle.trim()
    if (!title || !siteId) return

    setCreating(true)
    const { data } = await createCategoryAction(siteId, {
      title,
      is_published: true,
    })
    if (data) {
      setCategories((prev) => [...prev, data])
      onSelectionChange([...selectedCategoryIds, data.id])
      setNewCategoryTitle("")
      setShowCreateInput(false)
    }
    setCreating(false)
  }

  const selectedCategories = categories.filter((cat) =>
    selectedCategoryIds.includes(cat.id)
  )

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate text-muted-foreground">
              {selectedCategoryIds.length > 0
                ? `${selectedCategoryIds.length} categor${selectedCategoryIds.length === 1 ? "y" : "ies"} selected`
                : "Select categories..."}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search categories..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading categories...
                </div>
              ) : filteredCategories.length === 0 && !showCreateInput ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No categories found.
                </div>
              ) : (
                <CommandGroup>
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategoryIds.includes(cat.id)
                    const path = categoryPathMap.get(cat.id) || ""
                    const hasParent = !!cat.parent_id

                    return (
                      <div
                        key={cat.id}
                        onClick={() => toggleCategory(cat.id)}
                        className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col flex-1">
                          <span>{cat.title}</span>
                          {hasParent && (
                            <span className="text-xs text-muted-foreground">
                              {path}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CommandGroup>
              )}

              {/* Create new category */}
              <div className="border-t p-2">
                {showCreateInput ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newCategoryTitle}
                      onChange={(e) => setNewCategoryTitle(e.target.value)}
                      placeholder="New category name"
                      className="h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleCreateCategory()
                        }
                        if (e.key === "Escape") {
                          setShowCreateInput(false)
                          setNewCategoryTitle("")
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-3"
                      onClick={handleCreateCategory}
                      disabled={creating || !newCategoryTitle.trim()}
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
                    Create new category
                  </button>
                )}
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected category badges */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedCategories.map((cat) => (
            <Badge
              key={cat.id}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {cat.title}
              <button
                type="button"
                onClick={() => removeCategory(cat.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
