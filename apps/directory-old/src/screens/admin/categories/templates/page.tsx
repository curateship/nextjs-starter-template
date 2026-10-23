"use client"

import { TemplateListPage } from "@/components/admin/layout/templates/TemplateListPage"
import { parseCategoryBlocksFromJson } from "@/components/admin/category-builder/config/category-block-utils"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  createCategoryTemplate,
  deleteCategoryTemplates,
  getCategoryTemplateIdsAction,
  getCategoryTemplatesBySite,
  setDefaultCategoryTemplate,
  updateCategoryTemplate,
  type CategoryTemplate,
} from "@/lib/actions/categories/category-template-actions"

function getCategoryBlockCount(template: CategoryTemplate) {
  return parseCategoryBlocksFromJson(template.content_blocks || {}).length
}

export default function CategoryTemplatesPage() {
  const { currentSite } = useSiteSwitcher()

  return (
    <TemplateListPage
      // Categories list route is site-scoped, unlike directory's static parent
      breadcrumbParent={{ label: "Categories", href: currentSite ? `/admin/categories/${currentSite.id}` : "/admin/sites" }}
      createPlaceholder="e.g. Standard Category Layout"
      createTemplate={((a0) => createCategoryTemplate({ data: { input: a0 } }))}
      deleteTemplates={((a0) => deleteCategoryTemplates({ data: { ids: a0 } }))}
      emptyText="No templates yet. Create one to save reusable block layouts."
      getBlockCount={getCategoryBlockCount}
      getTemplateIds={((a0) => getCategoryTemplateIdsAction({ data: { siteId: a0 } }))}
      getTemplatesBySite={((a0, a1) => getCategoryTemplatesBySite({ data: { siteId: a0, options: a1 } }))}
      routeBase="/admin/categories/templates"
      setDefaultTemplate={((a0) => setDefaultCategoryTemplate({ data: { templateId: a0 } }))}
      updateTemplate={((a0, a1) => updateCategoryTemplate({ data: { templateId: a0, updates: a1 } }))}
    />
  )
}
