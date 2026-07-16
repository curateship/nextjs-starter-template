/**
 * Shared block preparation for the frontend *BlockRenderer components
 * (pages, products, posts, directories, events). Sorts blocks by
 * display_order and applies hidden-block rules: hidden blocks are filtered
 * out on live pages but shown (with hideBlock forced off in the returned
 * content) inside the builder preview.
 */

interface RenderableBlock {
  display_order?: unknown
  content?: Record<string, any> | null
}

/** Content for rendering: in preview, hidden blocks render with hideBlock forced off */
export function getRenderBlockContent<B extends RenderableBlock>(block: B, isPreview: boolean): B['content'] {
  if (!isPreview || !block.content?.visibility?.hideBlock) return block.content

  return {
    ...block.content,
    visibility: {
      ...block.content.visibility,
      hideBlock: false,
    },
  } as B['content']
}

/** Sort by display_order (non-numeric values sort as 0) and drop hidden blocks on live pages */
export function prepareBlocksForRender<B extends RenderableBlock>(blocks: B[], isPreview: boolean): B[] {
  const sorted = [...blocks].sort((a, b) => {
    const orderA = Number(a.display_order) || 0
    const orderB = Number(b.display_order) || 0
    return orderA - orderB
  })

  return isPreview
    ? sorted
    : sorted.filter((block) => block.content?.visibility?.hideBlock !== true)
}
