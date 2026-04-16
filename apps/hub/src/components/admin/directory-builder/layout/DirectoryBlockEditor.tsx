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
  onDirectoryTitleChange: (title: string) => void
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  showDirectoryTitleField?: boolean
}

export function DirectoryBlockEditor({
  block,
  content,
  onContentChange,
  siteId,
  directoryTitle,
  onDirectoryTitleChange,
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
        directoryData={{ title: directoryTitle }}
        onDirectoryTitleChange={onDirectoryTitleChange}
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
