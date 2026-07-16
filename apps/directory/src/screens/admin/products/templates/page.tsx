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
      createTemplate={createProductTemplate}
      deleteTemplates={deleteProductTemplates}
      emptyText="No templates yet. Create one to save reusable product layouts."
      getBlockCount={getProductBlockCount}
      getTemplateIds={getProductTemplateIdsAction}
      getTemplatesBySite={getProductTemplatesBySite}
      routeBase="/admin/products/templates"
      setDefaultTemplate={setDefaultProductTemplate}
    />
  )
}
