"use client"

import { TemplateListPage } from "@/components/admin/layout/templates/TemplateListPage"
import { parseProductBlocksFromJson } from "@/components/admin/product-builder/config/product-block-utils"
import {
  createProductTemplate,
  deleteProductTemplates,
  getProductTemplateIdsAction,
  getProductTemplatesBySite,
  setDefaultProductTemplate,
  type ProductTemplate,
} from "@/lib/actions/products/product-template-actions"

function getProductBlockCount(template: ProductTemplate) {
  return parseProductBlocksFromJson(template.content_blocks || {}).length
}

export default function ProductTemplatesPage() {
  return (
    <TemplateListPage
      breadcrumbParent={{ label: "Products", href: "/admin/products" }}
      createPlaceholder="e.g. Sales Page Layout"
      createTemplate={((a0) => createProductTemplate({ data: { input: a0 } }))}
      deleteTemplates={((a0) => deleteProductTemplates({ data: { ids: a0 } }))}
      emptyText="No templates yet. Create one to save reusable product layouts."
      getBlockCount={getProductBlockCount}
      getTemplateIds={((a0) => getProductTemplateIdsAction({ data: { siteId: a0 } }))}
      getTemplatesBySite={((a0, a1) => getProductTemplatesBySite({ data: { siteId: a0, options: a1 } }))}
      routeBase="/admin/products/templates"
      setDefaultTemplate={((a0) => setDefaultProductTemplate({ data: { templateId: a0 } }))}
    />
  )
}
