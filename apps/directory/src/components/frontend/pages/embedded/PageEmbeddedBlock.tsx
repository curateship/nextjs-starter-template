import { BlockContainer } from "@/components/frontend/layout/block-container"
import { sanitizeEmbedHtml } from "@/lib/utils/html-sanitizer"

interface EmbeddedBlockProps {
  content: {
    code?: string
    type?: 'html' | 'script'
    visibility?: Record<string, boolean>
  }
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function EmbeddedBlock({ content, className = "", siteWidth = 'custom', customWidth }: EmbeddedBlockProps) {
  const { code = '' } = content
  const sanitizedCode = sanitizeEmbedHtml(code)

  if (!sanitizedCode.trim() || content.visibility?.embed === false) {
    return null
  }

  return (
    <BlockContainer
      className={className}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div dangerouslySetInnerHTML={{ __html: sanitizedCode }} />
    </BlockContainer>
  )
}
