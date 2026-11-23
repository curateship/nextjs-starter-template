"use client"

import { TemplateListPage } from "@/components/admin/layout/templates/TemplateListPage"
import { parsePostBlocksFromJson } from "@/components/admin/post-builder/config/post-block-utils"
import {
  createPostTemplate,
  deletePostTemplates,
  getPostTemplateIdsAction,
  getPostTemplatesBySite,
  setDefaultPostTemplate,
  type PostTemplate,
} from "@/lib/actions/posts/post-template-actions"

function getPostBlockCount(template: PostTemplate) {
  return parsePostBlocksFromJson(template.content_blocks || {}).length
}

export default function PostTemplatesPage() {
  return (
    <TemplateListPage
      breadcrumbParent={{ label: "Posts", href: "/admin/posts" }}
      createPlaceholder="e.g. Article Layout"
      createTemplate={((a0) => createPostTemplate({ data: { input: a0 } }))}
      deleteTemplates={((a0) => deletePostTemplates({ data: { ids: a0 } }))}
      emptyText="No templates yet. Create one to save reusable post layouts."
      getBlockCount={getPostBlockCount}
      getTemplateIds={((a0) => getPostTemplateIdsAction({ data: { siteId: a0 } }))}
      getTemplatesBySite={((a0, a1) => getPostTemplatesBySite({ data: { siteId: a0, options: a1 } }))}
      routeBase="/admin/posts/templates"
      setDefaultTemplate={((a0) => setDefaultPostTemplate({ data: { templateId: a0 } }))}
    />
  )
}
