"use client"

import { DirectoryCoreBlock } from "@/components/admin/directory-builder/blocks/core/DirectoryCoreBlock"
import { DirectoryCustomBlock } from "@/components/admin/directory-builder/blocks/DirectoryCustomBlock"
import { DirectoryGoogleMapBlock } from "@/components/admin/directory-builder/blocks/google-map/DirectoryGoogleMapBlock"
import { DirectoryOpeningHoursBlock } from "@/components/admin/directory-builder/blocks/opening-hours/DirectoryOpeningHoursBlock"
import { DirectoryRichTextEditorBlock } from "@/components/admin/directory-builder/blocks/rich-text-editor/DirectoryRichTextEditorBlock"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from "@/lib/actions/directories/directory-google-map"
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from "@/lib/actions/directories/directory-opening-hours"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import type { DirectoryData } from "@/lib/actions/directories/directory-data"

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
  directoryData?: DirectoryData
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
  directoryData,
  onDirectoryTitleChange,
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
          featured_image: directoryFeaturedImage,
          fields: directoryData?.fields,
        }}
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

  if (block.type === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE) {
    return (
      <DirectoryGoogleMapBlock
        content={content}
        onContentChange={onContentChange}
      />
    )
  }

  if (block.type === DIRECTORY_OPENING_HOURS_BLOCK_TYPE) {
    return (
      <DirectoryOpeningHoursBlock
        content={content}
        onContentChange={onContentChange}
      />
    )
  }

  return null
}
