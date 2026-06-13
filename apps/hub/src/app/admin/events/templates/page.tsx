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
      createTemplate={createEventTemplate}
      deleteTemplates={deleteEventTemplates}
      emptyText="No templates yet. Create one to save reusable block layouts."
      getBlockCount={getEventBlockCount}
      getTemplateIds={getEventTemplateIdsAction}
      getTemplatesBySite={getEventTemplatesBySite}
      routeBase="/admin/events/templates"
      setDefaultTemplate={setDefaultEventTemplate}
      updateTemplate={updateEventTemplate}
    />
  )
}
