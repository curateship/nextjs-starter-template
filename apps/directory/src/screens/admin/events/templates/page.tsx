"use client"

import { TemplateListPage } from "@/components/admin/layout/templates/TemplateListPage"
import { parseEventBlocksFromJson } from "@/components/admin/event-builder/config/event-block-utils"
import {
  createEventTemplate,
  deleteEventTemplates,
  getEventTemplateIdsAction,
  getEventTemplatesBySite,
  setDefaultEventTemplate,
  updateEventTemplate,
  type EventTemplate,
} from "@/lib/actions/events/event-template-actions"

function getEventBlockCount(template: EventTemplate) {
  return parseEventBlocksFromJson(template.content_blocks || {}).length
}

export default function EventTemplatesPage() {
  return (
    <TemplateListPage
      breadcrumbParent={{ label: "Events", href: "/admin/events" }}
      createPlaceholder="e.g. Standard Event Layout"
      createTemplate={((a0) => createEventTemplate({ data: { input: a0 } }))}
      deleteTemplates={((a0) => deleteEventTemplates({ data: { ids: a0 } }))}
      emptyText="No templates yet. Create one to save reusable block layouts."
      getBlockCount={getEventBlockCount}
      getTemplateIds={((a0) => getEventTemplateIdsAction({ data: { siteId: a0 } }))}
      getTemplatesBySite={((a0, a1) => getEventTemplatesBySite({ data: { siteId: a0, options: a1 } }))}
      routeBase="/admin/events/templates"
      setDefaultTemplate={((a0) => setDefaultEventTemplate({ data: { templateId: a0 } }))}
      updateTemplate={((a0, a1) => updateEventTemplate({ data: { templateId: a0, updates: a1 } }))}
    />
  )
}
