"use client"

import { TemplateListPage } from "@/components/admin/layout/templates/TemplateListPage"
import { parseDirectoryBlocksFromJson } from "@/components/admin/directory-builder/config/directory-block-utils"
import {
  createDirectoryTemplate,
  deleteDirectoryTemplates,
  getDirectoryTemplateIdsAction,
  getDirectoryTemplatesBySite,
  setDefaultDirectoryTemplate,
  updateDirectoryTemplate,
  type DirectoryTemplate,
} from "@/lib/actions/directories/directory-template-actions"

function getDirectoryBlockCount(template: DirectoryTemplate) {
  return parseDirectoryBlocksFromJson(template.content_blocks || {}).length
}

export default function DirectoryTemplatesPage() {
  return (
    <TemplateListPage
      breadcrumbParent={{ label: "Directory", href: "/admin/directory" }}
      createPlaceholder="e.g. Featured Listing Layout"
      createTemplate={((a0) => createDirectoryTemplate({ data: { input: a0 } }))}
      deleteTemplates={((a0) => deleteDirectoryTemplates({ data: { ids: a0 } }))}
      emptyText="No templates yet. Create one to save reusable block layouts."
      enableDefaultCategoryParent
      getBlockCount={getDirectoryBlockCount}
      getTemplateIds={((a0) => getDirectoryTemplateIdsAction({ data: { siteId: a0 } }))}
      getTemplatesBySite={((a0, a1) => getDirectoryTemplatesBySite({ data: { siteId: a0, options: a1 } }))}
      routeBase="/admin/directory/templates"
      setDefaultTemplate={((a0) => setDefaultDirectoryTemplate({ data: { templateId: a0 } }))}
      updateTemplate={((a0, a1) => updateDirectoryTemplate({ data: { templateId: a0, updates: a1 } }))}
    />
  )
}
