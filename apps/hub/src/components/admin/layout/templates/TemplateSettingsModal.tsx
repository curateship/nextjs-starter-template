"use client"

import { useEffect, useMemo, useState } from "react"

import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getCategoriesForSiteAction, type Category } from "@/lib/actions/categories/category-actions"

type TemplateSettingsRecord = {
  id: string
  site_id: string
  name: string
  content_blocks: Record<string, any>
}

type TemplateSettingsModalProps<TTemplate extends TemplateSettingsRecord> = {
  contentBlocks?: Record<string, any>
  createPlaceholder: string
  enableDefaultCategoryParent?: boolean
  onError?: (error: string) => void
  onOpenChange: (open: boolean) => void
  onSaved: (template: TTemplate) => void
  open: boolean
  template: TTemplate | null
  updateTemplate: (
    templateId: string,
    updates: { name?: string; content_blocks?: Record<string, any> }
  ) => Promise<{ data: TTemplate | null; error: string | null }>
}

const DEFAULT_CATEGORY_PARENT_KEY = "default_category_parent_id"
const LEGACY_DEFAULT_BREADCRUMB_PARENT_KEY = "default_breadcrumb_parent_id"
const EMPTY_CONTENT_BLOCKS: Record<string, any> = {}

function getTemplateSettings(contentBlocks: Record<string, any>) {
  return contentBlocks?._settings && typeof contentBlocks._settings === "object" ? contentBlocks._settings : {}
}

function getDefaultCategoryParentId(contentBlocks: Record<string, any>) {
  const settings = getTemplateSettings(contentBlocks)
  const parentId = settings[DEFAULT_CATEGORY_PARENT_KEY] ?? settings[LEGACY_DEFAULT_BREADCRUMB_PARENT_KEY]
  return typeof parentId === "string" && parentId.length > 0 ? parentId : null
}

function setDefaultCategoryParentId(contentBlocks: Record<string, any>, parentId: string | null) {
  const settings = {
    ...getTemplateSettings(contentBlocks),
    [DEFAULT_CATEGORY_PARENT_KEY]: parentId,
  }

  delete settings[LEGACY_DEFAULT_BREADCRUMB_PARENT_KEY]

  return {
    ...contentBlocks,
    _settings: settings,
  }
}

async function getAllCategoriesForSite(siteId: string) {
  const pageSize = 100
  let page = 1
  let total = 0
  const allCategories: Category[] = []

  do {
    const { data, total: categoryTotal, error } = await getCategoriesForSiteAction(siteId, { page, pageSize })
    if (error) throw new Error(error)
    if (!data || data.length === 0) break

    allCategories.push(...data)
    total = categoryTotal
    page += 1
  } while (allCategories.length < total)

  return allCategories
}

export function TemplateSettingsModal<TTemplate extends TemplateSettingsRecord>({
  contentBlocks,
  createPlaceholder,
  enableDefaultCategoryParent = false,
  onError,
  onOpenChange,
  onSaved,
  open,
  template,
  updateTemplate,
}: TemplateSettingsModalProps<TTemplate>) {
  const [name, setName] = useState("")
  const [categoryParentId, setCategoryParentId] = useState("none")
  const [categories, setCategories] = useState<Category[]>([])
  const [saving, setSaving] = useState(false)
  const sourceContentBlocks = useMemo(
    () => contentBlocks || template?.content_blocks || EMPTY_CONTENT_BLOCKS,
    [contentBlocks, template?.content_blocks]
  )
  const topLevelCategories = categories.filter((category) => category.is_published && !category.parent_id)

  useEffect(() => {
    if (!open || !template) return

    setName(template.name)
    setCategoryParentId(getDefaultCategoryParentId(sourceContentBlocks) || "none")
    setCategories([])
  }, [open, sourceContentBlocks, template])

  useEffect(() => {
    if (!open || !template?.site_id || !enableDefaultCategoryParent) return

    let cancelled = false
    getAllCategoriesForSite(template.site_id).then((nextCategories) => {
      if (!cancelled) setCategories(nextCategories)
    }).catch((categoryError) => {
      if (!cancelled) onError?.(categoryError instanceof Error ? categoryError.message : "Failed to fetch categories")
    })

    return () => {
      cancelled = true
    }
  }, [enableDefaultCategoryParent, onError, open, template?.site_id])

  async function handleSave() {
    if (!template || !name.trim()) return

    setSaving(true)

    const updates: { name: string; content_blocks?: Record<string, any> } = { name: name.trim() }
    if (enableDefaultCategoryParent) {
      updates.content_blocks = setDefaultCategoryParentId(
        sourceContentBlocks,
        categoryParentId === "none" ? null : categoryParentId
      )
    }

    const { data, error } = await updateTemplate(template.id, updates)
    if (error) {
      onError?.(error)
    } else if (data) {
      onSaved(data)
      onOpenChange(false)
    }

    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DashboardModalContent
        className="max-w-xl"
        title="Template Settings"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Template</DashboardModalCardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel htmlFor="template-settings-name">Title *</FieldLabel>
                <Input
                  id="template-settings-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={createPlaceholder}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      handleSave()
                    }
                  }}
                />
              </Field>
              {enableDefaultCategoryParent && (
                <Field>
                  <FieldLabel htmlFor="template-settings-category-parent">Default category parent</FieldLabel>
                  <Select value={categoryParentId} onValueChange={setCategoryParentId}>
                    <SelectTrigger id="template-settings-category-parent" className="w-full">
                      <SelectValue placeholder="Select parent category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No default parent</SelectItem>
                      {topLevelCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </Dialog>
  )
}
