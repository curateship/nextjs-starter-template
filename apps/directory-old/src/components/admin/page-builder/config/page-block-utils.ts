import type { ContentBlock } from "@/lib/utils/block-utils"

export function normalizePageRichTextContent(content?: Record<string, any> | null): Record<string, any> {
  const source = content && typeof content === "object" ? content : {}
  const body =
    typeof source.body === "string"
      ? source.body
      : typeof source.content === "string"
        ? source.content
        : ""
  const visibility =
    source.visibility && typeof source.visibility === "object"
      ? source.visibility
      : {}

  return {
    body,
    format: "html",
    visibility,
  }
}

export function normalizePageBlockContent(type: string, content?: Record<string, any> | null): Record<string, any> {
  if (type === "rich-text") {
    return normalizePageRichTextContent(content)
  }

  return content && typeof content === "object" ? content : {}
}

export function normalizePageBlock<TBlock extends ContentBlock>(block: TBlock): TBlock {
  return {
    ...block,
    content: normalizePageBlockContent(block.type, block.content),
  }
}
