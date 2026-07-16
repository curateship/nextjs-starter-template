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
      createTemplate={createCategoryTemplate}
      deleteTemplates={deleteCategoryTemplates}
      emptyText="No templates yet. Create one to save reusable block layouts."
      getBlockCount={getCategoryBlockCount}
      getTemplateIds={getCategoryTemplateIdsAction}
      getTemplatesBySite={getCategoryTemplatesBySite}
      routeBase="/admin/categories/templates"
      setDefaultTemplate={setDefaultCategoryTemplate}
      updateTemplate={updateCategoryTemplate}
    />
  )
}
