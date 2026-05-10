"use client"

import { TemplateListPage } from "@/components/admin/layout/templates/TemplateListPage"
import { parseDirectoryBlocksFromJson } from "@/components/admin/directory-builder/config/directory-block-utils"
import {
  createDirectoryTemplate,
  deleteDirectoryTemplates,
  getDirectoryTemplateIdsAction,
  getDirectoryTemplatesBySite,
  setDefaultDirectoryTemplate,
  type DirectoryTemplate,
} from "@/lib/actions/directories/directory-template-actions"

function getDirectoryBlockCount(template: DirectoryTemplate) {
  return parseDirectoryBlocksFromJson(template.content_blocks || {}).length
}

export default function DirectoryTemplatesPage() {
  return (
    <TemplateListPage
      breadcrumbParent={{ label: "Directory", href: "/admin/directories" }}
      createPlaceholder="e.g. Featured Listing Layout"
      createTemplate={createDirectoryTemplate}
      deleteTemplates={deleteDirectoryTemplates}
      emptyText="No templates yet. Create one to save reusable block layouts."
      getBlockCount={getDirectoryBlockCount}
      getTemplateIds={getDirectoryTemplateIdsAction}
      getTemplatesBySite={getDirectoryTemplatesBySite}
      routeBase="/admin/directories/templates"
      setDefaultTemplate={setDefaultDirectoryTemplate}
    />
  )
}
