"use client"

import { use } from "react"
import Blocks from "lucide-react/dist/esm/icons/blocks.js"
import { TemplateEditorPage } from "@/components/admin/layout/templates/TemplateEditorPage"
import { DIRECTORY_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/directory-builder/config/directory-block-types"
import {
  directoryBlocksToJson,
  parseDirectoryBlocksFromJson,
  type DirectoryEditorBlock,
} from "@/components/admin/directory-builder/config/directory-block-utils"
import { DirectoryPreview } from "@/components/admin/directory-builder/layout/DirectoryPreview"
import { DirectoryBlockEditorModal } from "@/components/admin/directory-builder/layout/DirectoryBlockEditorModal"
import { DirectoryTemplateBlockListPanel } from "@/components/admin/directory-builder/layout/DirectoryTemplateBlockListPanel"
import {
  getDirectoryTemplateById,
  updateDirectoryTemplate,
} from "@/lib/actions/directories/directory-template-actions"
import {
  DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY,
  getDirectoryTemplatePreviewBreadcrumbs,
  withDirectoryTemplatePreviewValues,
} from "@/lib/actions/directories/directory-template-inheritance"
import { getDirectoryCustomBlocksBySite } from "@/lib/actions/directories/directory-custom-block-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import {
  getDirectoryCustomBlockSelectionType,
  parseDirectoryCustomBlockSelectionType,
} from "@/lib/actions/directories/directory-custom-blocks/utils"

interface PageProps {
  params: Promise<{ templateId: string }>
}

type CustomBlocks = DirectoryCustomBlockTemplate[]

export default function DirectoryTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)

  return (
    <TemplateEditorPage<DirectoryEditorBlock, CustomBlocks>
      templateId={templateId}
      getTemplateById={(id) => getDirectoryTemplateById({ data: { templateId: id } })}
      updateTemplate={(id, updates) => updateDirectoryTemplate({ data: { templateId: id, updates } })}
      loadExtra={async (template) => {
        const { data } = await getDirectoryCustomBlocksBySite({ data: { siteId: template.site_id } })
        return data || []
      }}
      parseBlocks={(contentBlocks, customBlocks) => parseDirectoryBlocksFromJson(contentBlocks, customBlocks)}
      blocksToJson={directoryBlocksToJson}
      withPreviewValues={(blocks, customBlocks) => withDirectoryTemplatePreviewValues(blocks, customBlocks)}
      buildBlocks={(selection, customBlocks) => {
        const created: DirectoryEditorBlock[] = []
        const customTemplateId = parseDirectoryCustomBlockSelectionType(selection.type)

        if (customTemplateId) {
          const customTemplate = (customBlocks || []).find((item) => item.id === customTemplateId)
          if (!customTemplate) return []

          for (let index = 0; index < selection.quantity; index += 1) {
            const timestamp = Date.now() + index
            created.push({
              id: `directory-custom-${timestamp}`,
              type: 'directory-custom',
              title: customTemplate.name,
              content: {
                templateId: customTemplate.id,
              },
            })
          }
          return created
        }

        const blockDefinition = getBlockTypeDefinition(selection.type)
        if (!blockDefinition) return []

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
      getSelectionProps={(customBlocks) => ({
        sections: [
          { title: 'Built In', blockTypes: DIRECTORY_BLOCK_TYPES },
          {
            title: 'Custom',
            blockTypes: (customBlocks || []).map((customTemplate) => ({
              type: getDirectoryCustomBlockSelectionType(customTemplate.id),
              name: customTemplate.name,
              icon: Blocks,
              description: `${customTemplate.layout} • ${customTemplate.fields.length} field${customTemplate.fields.length === 1 ? '' : 's'}`,
              defaultContent: {
                templateId: customTemplate.id,
              },
            })),
          },
        ],
      })}
      routeBase="/admin/directory/templates"
      createPlaceholder="e.g. Featured Listing Layout"
      entityName="directory template"
      enableDefaultCategoryParent
      renderPreview={({ previewBlocks, template, site, siteId, blocks, loading, selectedBlock, onSelectBlock, extra }) => (
        <DirectoryPreview
          blocks={previewBlocks}
          directory={{
            slug: 'preview-template',
            name: DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.title,
            title: DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.title,
            id: 'preview',
            site_id: template?.site_id || siteId || 'preview-site',
            featured_image: DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.featuredImage,
            status: 'draft',
          } as any}
          site={site}
          customBlockTemplates={extra}
          blocksLoading={loading}
          allBlocks={blocks}
          selectedBlock={selectedBlock}
          onSelectBlock={onSelectBlock as any}
          previewBreadcrumbs={getDirectoryTemplatePreviewBreadcrumbs(site?.settings)}
        />
      )}
      renderBlockEditor={({ selectedBlock, draftContent, siteId, extra, onDraftChange, onCloseBlockEditor, onSaveBlockEditor, savingBlock }) => (
        <DirectoryBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={siteId}
          directoryTitle={DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY.title}
          onDirectoryTitleChange={() => {}}
          onContentChange={onDraftChange}
          customBlockTemplates={extra}
          showDirectoryTitleField={false}
          onClose={onCloseBlockEditor}
          onSave={onSaveBlockEditor}
          saving={savingBlock}
          mode="template"
        />
      )}
      renderBlockListPanel={({ blocks, selectedBlock, onSelectBlock, onDeleteBlock, onReorderBlocks, onAddBlock, loading }) => (
        <DirectoryTemplateBlockListPanel
          blocks={blocks}
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
