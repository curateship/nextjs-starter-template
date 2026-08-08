"use client"

import { use } from "react"
import { TemplateEditorPage } from "@/components/admin/layout/templates/TemplateEditorPage"
import { CATEGORY_BLOCK_TYPES, getBlockTypeDefinition } from "@/components/admin/category-builder/config/category-block-types"
import {
  categoryBlocksToJson,
  parseCategoryBlocksFromJson,
  type CategoryEditorBlock,
} from "@/components/admin/category-builder/config/category-block-utils"
import { CategoryPreview } from "@/components/admin/category-builder/layout/CategoryPreview"
import { CategoryBlockEditorModal } from "@/components/admin/category-builder/layout/CategoryBlockEditorModal"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import {
  getCategoryTemplateById,
  updateCategoryTemplate,
} from "@/lib/actions/categories/category-template-actions"
import {
  CATEGORY_TEMPLATE_PREVIEW_CATEGORY,
  withCategoryTemplatePreviewValues,
} from "@/lib/actions/categories/category-template-inheritance"

interface PageProps {
  params: Promise<{ templateId: string }>
}

export default function CategoryTemplateEditorPage({ params }: PageProps) {
  const { templateId } = use(params)

  return (
    <TemplateEditorPage<CategoryEditorBlock>
      templateId={templateId}
      getTemplateById={(id) => getCategoryTemplateById({ data: { templateId: id } })}
      updateTemplate={(id, updates) => updateCategoryTemplate({ data: { templateId: id, updates } })}
      parseBlocks={(contentBlocks) => parseCategoryBlocksFromJson(contentBlocks)}
      blocksToJson={categoryBlocksToJson}
      withPreviewValues={(blocks) => withCategoryTemplatePreviewValues(blocks)}
      buildBlocks={(selection) => {
        const blockDefinition = getBlockTypeDefinition(selection.type)
        if (!blockDefinition) return []

        const created: CategoryEditorBlock[] = []
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
      getSelectionProps={() => ({ blockTypes: CATEGORY_BLOCK_TYPES })}
      routeBase="/admin/categories/templates"
      createPlaceholder="e.g. Standard Category Layout"
      entityName="category template"
      renderPreview={({ previewBlocks, template, site, siteId, blocks, loading, onSelectBlock }) => (
        <CategoryPreview
          blocks={previewBlocks}
          category={{
            id: "preview",
            title: CATEGORY_TEMPLATE_PREVIEW_CATEGORY.title,
            slug: "preview",
            site_id: template?.site_id || siteId || "preview-site",
            featured_image: CATEGORY_TEMPLATE_PREVIEW_CATEGORY.featuredImage,
          }}
          site={site}
          blocksLoading={loading}
          allBlocks={blocks}
          onSelectBlock={onSelectBlock}
        />
      )}
      renderBlockEditor={({ selectedBlock, draftContent, siteId, onDraftChange, onCloseBlockEditor, onSaveBlockEditor, savingBlock }) => (
        <CategoryBlockEditorModal
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
          blockTypes={CATEGORY_BLOCK_TYPES}
          entityName="category template"
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
