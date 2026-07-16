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
      createTemplate={createPostTemplate}
      deleteTemplates={deletePostTemplates}
      emptyText="No templates yet. Create one to save reusable post layouts."
      getBlockCount={getPostBlockCount}
      getTemplateIds={getPostTemplateIdsAction}
      getTemplatesBySite={getPostTemplatesBySite}
      routeBase="/admin/posts/templates"
      setDefaultTemplate={setDefaultPostTemplate}
    />
  )
}
