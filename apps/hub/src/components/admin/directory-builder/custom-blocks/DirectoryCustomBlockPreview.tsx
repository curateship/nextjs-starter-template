"use client"

import { DirectoryCustomBlockSection } from "@/components/frontend/directories/DirectoryCustomBlockSection"
import { buildDirectoryCustomPreviewValues } from "@/lib/actions/directories/directory-custom-blocks/utils"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"

interface DirectoryCustomBlockPreviewProps {
  template: Pick<DirectoryCustomBlockTemplate, 'name' | 'layout' | 'fields'>
  width: 'desktop' | 'mobile'
}

const PREVIEW_WIDTHS = {
  desktop: 960,
  mobile: 390,
} as const

export function DirectoryCustomBlockPreview({
  template,
  width,
}: DirectoryCustomBlockPreviewProps) {
  const previewValues = buildDirectoryCustomPreviewValues(template.fields)

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-6 md:p-8">
      <div
        className="mx-auto transition-all"
        style={{ maxWidth: PREVIEW_WIDTHS[width] }}
      >
        {template.fields.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Add fields from the left panel to preview this custom block.
          </div>
        ) : (
          <div className="min-h-[360px]">
            <DirectoryCustomBlockSection
              template={template}
              values={previewValues}
            />
          </div>
        )}
      </div>
    </div>
  )
}
