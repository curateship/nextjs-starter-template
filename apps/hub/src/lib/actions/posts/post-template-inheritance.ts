// Post template inheritance:
// templates own block structure + settings, post rows store only post values.

import {
  blocksToTemplateValueJson,
  getTemplateNonBlockEntries,
  hasTemplateValue,
  isTemplateBlockEntry,
  mergeTemplateBlocks,
  pruneTemplateValueBlocks,
  sanitizeTemplateBlocks,
} from '../template-inheritance-core'

export const POST_BLANK_TEMPLATE_NAME = 'Blank'
export const POST_CORE_BLOCK_TYPE = 'core'
export const POST_RELATED_BLOCK_TYPE = 'related-posts'
export const POST_TABLE_OF_CONTENTS_BLOCK_TYPE = 'table-of-contents'

const POST_VALUE_KEYS: Record<string, string[]> = {
  [POST_CORE_BLOCK_TYPE]: ['body', 'text', 'format'],
  [POST_RELATED_BLOCK_TYPE]: [],
  [POST_TABLE_OF_CONTENTS_BLOCK_TYPE]: [],
}

const POST_TEMPLATE_CONTENT_KEYS: Record<string, string[]> = {
  [POST_CORE_BLOCK_TYPE]: ['layoutColumn', 'coreStyle', 'styleConfig', 'visibility'],
  [POST_RELATED_BLOCK_TYPE]: [
    'layoutColumn',
    'title',
    'subtitle',
    'displayMode',
    'columns',
    'itemsToShow',
    'sortBy',
    'sortOrder',
    'visibility',
  ],
  [POST_TABLE_OF_CONTENTS_BLOCK_TYPE]: ['layoutColumn', 'title', 'sticky', 'headingLevel', 'visibility'],
}

const POST_TEMPLATE_PREVIEW_BODY = `
<h2>Sample section</h2>
<p>This is sample post content. Use this block to decide how articles should appear in the template.</p>
<p>Real article text is edited on each post.</p>
`.trim()

export const POST_TEMPLATE_PREVIEW_POST = {
  title: 'Preview Post',
}

const postTemplateInheritanceConfig = {
  valueKeys: POST_VALUE_KEYS,
  templateContentKeys: POST_TEMPLATE_CONTENT_KEYS,
  getInitialValueEntries: getPostNonBlockEntries,
}

export function getPostNonBlockEntries(contentBlocks: Record<string, any> = {}) {
  return getTemplateNonBlockEntries(contentBlocks, (key, value) => key.startsWith('_') || !isTemplateBlockEntry(value))
}

export function sanitizePostTemplateBlocks(contentBlocks: Record<string, any> = {}) {
  return sanitizeTemplateBlocks(contentBlocks, postTemplateInheritanceConfig)
}

export function postBlocksToValueJson(blocks: Array<{ id: string; type: string; content: Record<string, any>; display_order?: number }>) {
  return blocksToTemplateValueJson(blocks, postTemplateInheritanceConfig)
}

export function prunePostValueBlocksForTemplate(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>
) {
  return pruneTemplateValueBlocks(valueBlocks, templateBlocks, postTemplateInheritanceConfig)
}

export function mergePostTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>
) {
  return mergeTemplateBlocks(templateBlocks, valueBlocks, postTemplateInheritanceConfig)
}

export function withPostTemplatePreviewValues<TBlock extends { type: string; content: Record<string, any> }>(
  blocks: TBlock[]
) {
  return blocks.map((block) => {
    if (block.type !== POST_CORE_BLOCK_TYPE || hasTemplateValue(block.content?.body) || hasTemplateValue(block.content?.text)) {
      return block
    }

    return {
      ...block,
      content: {
        ...(block.content || {}),
        body: POST_TEMPLATE_PREVIEW_BODY,
        format: 'html',
      },
    }
  })
}
