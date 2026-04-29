"use client"

import { DirectoryCoreBlock } from "@/components/admin/directory-builder/blocks/core/DirectoryCoreBlock"
import { DirectoryCustomBlock } from "@/components/admin/directory-builder/blocks/DirectoryCustomBlock"
import { DirectoryRichTextEditorBlock } from "@/components/admin/directory-builder/blocks/rich-text-editor/DirectoryRichTextEditorBlock"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface DirectoryBlockEditorProps {
  block: DirectoryBlock
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  directoryTitle: string
  directoryDescription?: string | null
  directoryFeaturedImage?: string | null
  onDirectoryTitleChange: (title: string) => void
  onDirectoryDescriptionChange?: (description: string) => void
  onDirectoryFeaturedImageChange?: (featuredImage: string) => void
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  showDirectoryTitleField?: boolean
}

export function DirectoryBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  directoryTitle,
  directoryDescription,
  directoryFeaturedImage,
  onDirectoryTitleChange,
  onDirectoryDescriptionChange,
  onDirectoryFeaturedImageChange,
  customBlockTemplates,
  showDirectoryTitleField = true,
}: DirectoryBlockEditorProps) {
  if (block.type === DIRECTORY_CORE_BLOCK_TYPE) {
    return (
      <DirectoryCoreBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        directoryData={{
          title: directoryTitle,
          description: directoryDescription,
          featured_image: directoryFeaturedImage,
        }}
        onDirectoryTitleChange={onDirectoryTitleChange}
        onDirectoryDescriptionChange={onDirectoryDescriptionChange}
        onDirectoryFeaturedImageChange={onDirectoryFeaturedImageChange}
        showDirectoryTitleField={showDirectoryTitleField}
      />
    )
  }

  if (block.type === "directory-custom") {
    return (
      <DirectoryCustomBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        template={customBlockTemplates.find((template) => template.id === content?.templateId) || null}
      />
    )
  }

  if (block.type === "directory-rich-text") {
    return (
      <DirectoryRichTextEditorBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        blockId={block.id}
      />
    )
  }

  return null
}
