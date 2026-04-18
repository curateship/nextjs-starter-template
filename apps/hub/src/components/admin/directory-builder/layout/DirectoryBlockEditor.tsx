"use client"

import { DirectoryContentBlock } from "@/components/admin/directory-builder/blocks/DirectoryContentBlock"
import { DirectoryCustomBlock } from "@/components/admin/directory-builder/blocks/DirectoryCustomBlock"
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
  directoryFeaturedImage?: string | null
  onDirectoryTitleChange: (title: string) => void
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
  directoryFeaturedImage,
  onDirectoryTitleChange,
  onDirectoryFeaturedImageChange,
  customBlockTemplates,
  showDirectoryTitleField = true,
}: DirectoryBlockEditorProps) {
  if (block.type === "directory-content") {
    return (
      <DirectoryContentBlock
        content={content}
        onContentChange={onContentChange}
        siteId={siteId}
        blockId={block.id}
        directoryData={{ title: directoryTitle, featured_image: directoryFeaturedImage }}
        onDirectoryTitleChange={onDirectoryTitleChange}
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

  return null
}
