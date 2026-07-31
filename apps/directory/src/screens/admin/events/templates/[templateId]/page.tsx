"use client"

import { use } from "react"
import { TemplateEditorPage } from "@/components/admin/layout/templates/TemplateEditorPage"
import { EVENT_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/event-builder/config/event-block-types"
import {
  eventBlocksToJson,
  parseEventBlocksFromJson,
  type EventEditorBlock,
} from "@/components/admin/event-builder/config/event-block-utils"
import { EventPreview } from "@/components/admin/event-builder/layout/EventPreview"
import { EventBlockEditorModal } from "@/components/admin/event-builder/layout/EventBlockEditorModal"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import {
  getEventTemplateById,
  updateEventTemplate,
} from "@/lib/actions/events/event-template-actions"
import {
  EVENT_TEMPLATE_PREVIEW_EVENT,
  withEventTemplatePreviewValues,
} from "@/lib/actions/events/event-template-inheritance"

interface PageProps {
  params: Promise<{ templateId: string }>
}

export default function EventTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)

  return (
    <TemplateEditorPage<EventEditorBlock>
      templateId={templateId}
      getTemplateById={(id) => getEventTemplateById({ data: { templateId: id } })}
      updateTemplate={(id, updates) => updateEventTemplate({ data: { templateId: id, updates } })}
      parseBlocks={(contentBlocks) => parseEventBlocksFromJson(contentBlocks)}
      blocksToJson={eventBlocksToJson}
      withPreviewValues={(blocks) => withEventTemplatePreviewValues(blocks)}
      buildBlocks={(selection) => {
        const blockDefinition = getBlockTypeDefinition(selection.type)
        if (!blockDefinition) return []

        const created: EventEditorBlock[] = []
        for (let index = 0; index < selection.quantity; index += 1) {
          const timestamp = Date.now() + index
          created.push({
            id: `${selection.type}-${timestamp}`,
            type: selection.type,
            title: blockDefinition.name,
            content: { ...blockDefinition.defaultContent },
          })
        }
        return created
      }}
      getSelectionProps={() => ({ blockTypes: EVENT_BLOCK_TYPES })}
      routeBase="/admin/events/templates"
      createPlaceholder="e.g. Standard Event Layout"
      entityName="event template"
      renderPreview={({ previewBlocks, template, site, siteId, blocks, loading, onSelectBlock }) => (
        <EventPreview
          blocks={previewBlocks}
          event={{
            id: "preview",
            title: EVENT_TEMPLATE_PREVIEW_EVENT.title,
            slug: "preview",
            site_id: template?.site_id || siteId || "preview-site",
            featured_image: EVENT_TEMPLATE_PREVIEW_EVENT.featuredImage,
          }}
          site={site}
          blocksLoading={loading}
          allBlocks={blocks}
          onSelectBlock={onSelectBlock}
        />
      )}
      renderBlockEditor={({ selectedBlock, draftContent, siteId, onDraftChange, onCloseBlockEditor, onSaveBlockEditor, savingBlock }) => (
        <EventBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={siteId}
          onContentChange={onDraftChange}
          onClose={onCloseBlockEditor}
          onSave={onSaveBlockEditor}
          saving={savingBlock}
          mode="template"
        />
      )}
      renderBlockListPanel={({ blocks, selectedBlock, onSelectBlock, onDeleteBlock, onReorderBlocks, onAddBlock, loading }) => (
        <BlockListPanel
          blocks={blocks}
          blockTypes={EVENT_BLOCK_TYPES}
          entityName="event template"
          selectedBlock={selectedBlock}
          onSelectBlock={onSelectBlock}
          onDeleteBlock={onDeleteBlock}
          onReorderBlocks={onReorderBlocks}
          onAddBlock={onAddBlock}
          deleting={null}
          blocksLoading={loading}
        />
      )}
    />
  )
}
