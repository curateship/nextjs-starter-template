"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Skeleton } from "@/components/ui/skeleton"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"
import { getCategoriesForSiteAction, type Category } from "@/lib/actions/categories/category-actions"

interface PageCategoriesListingBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  onBack?: () => void
}

async function getAllCategoriesForSite(siteId: string) {
  const pageSize = 100
  let page = 1
  let total = 0
  const allCategories: Category[] = []

  do {
    const { data, total: categoryTotal } = await getCategoriesForSiteAction({ data: { siteId: siteId, options: { page, pageSize } } })
    if (!data || data.length === 0) break

    allCategories.push(...data)
    total = categoryTotal
    page += 1
  } while (allCategories.length < total)

  return allCategories
}

function getCategoryParentId(category: Category) {
  return category.parent_id ?? null
}

function buildCategoryOptions(categories: Category[]): ComboboxOption[] {
  return categories
    .filter((category) => category.is_published && !getCategoryParentId(category))
    .map((category) => ({
      value: category.id,
      label: category.title,
    }))
}

export function PageCategoriesListingBlock({
  content,
  onContentChange,
  siteId,
  onBack,
}: PageCategoriesListingBlockProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!siteId) return

    let cancelled = false
    setLoading(true)
    getAllCategoriesForSite(siteId)
      .then((data) => {
        if (!cancelled) setCategories(data)
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [siteId])

  const categoryOptions = useMemo(() => buildCategoryOptions(categories), [categories])
  const title = typeof content.title === "string" ? content.title : ""
  const subtitle = typeof content.subtitle === "string" ? content.subtitle : ""
  const parentCategoryId = typeof content.parentCategoryId === "string" ? content.parentCategoryId : ""
  const chipsToShow = Number.isFinite(Number(content.chipsToShow)) ? Number(content.chipsToShow) : 20
  const visibility = content.visibility && typeof content.visibility === "object" ? content.visibility : {}

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Header">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="categories-listing-title">Title</Label>
                        <Input
                          id="categories-listing-title"
                          value={title}
                          onChange={(event) => onContentChange("title", event.target.value)}
                          placeholder="Browse Categories"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="categories-listing-subtitle">Subtitle</Label>
                        <Input
                          id="categories-listing-subtitle"
                          value={subtitle}
                          onChange={(event) => onContentChange("subtitle", event.target.value)}
                          placeholder="Optional subtitle"
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Categories">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                      <div className="space-y-2">
                        <Label>Parent Category</Label>
                        {loading ? (
                          <Skeleton className="h-10 w-full" />
                        ) : (
                          <Combobox
                            options={categoryOptions}
                            value={parentCategoryId}
                            onValueChange={(value) => onContentChange("parentCategoryId", value)}
                            placeholder="Select parent category"
                            searchPlaceholder="Search categories..."
                            emptyMessage="No categories found."
                            allowClear
                          />
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="categories-listing-chips-to-show">Chips to Show</Label>
                        <Input
                          id="categories-listing-chips-to-show"
                          type="number"
                          min={1}
                          max={100}
                          value={chipsToShow}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            onContentChange("chipsToShow", Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : 20)
                          }}
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <VisibilitySettings
                visibility={visibility}
                onChange={(value) => onContentChange("visibility", value)}
                useCard
                fields={[
                  { key: "title", label: "Title" },
                  { key: "subtitle", label: "Subtitle" },
                  { key: "chips", label: "Category Chips" },
                ]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
