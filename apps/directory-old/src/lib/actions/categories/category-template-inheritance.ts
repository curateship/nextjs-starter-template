// Category template inheritance (mirrors directory-template-inheritance.ts):
// templates own block structure + settings, category rows store only values.
// One key difference from directories: category rows keep row-level settings
// (_settings.is_private, show_featured_image) inside content_blocks, so every
// helper here preserves non-block entries from the VALUE side, not the template.

import {
  blocksToTemplateValueJson,
  getTemplateNonBlockEntries,
  hasTemplateValue,
  mergeTemplateBlocks,
  pruneTemplateValueBlocks,
  sanitizeTemplateBlocks,
} from '../template-inheritance-core'

export const CATEGORY_BLANK_TEMPLATE_NAME = 'Blank'
export const CATEGORY_LISTINGS_BLOCK_TYPE = 'category-listings'
export const CATEGORY_CORE_BLOCK_TYPE = 'category-core'
export const CATEGORY_CHILDREN_GRID_BLOCK_TYPE = 'category-children-grid'

// Per-category value keys. The Listings block is fully template-configured
// (the rendered category is injected at runtime), so it has no value keys.
// The Core block's rich text is edited per category (title/featured image are
// category row fields, not block content — mirrors the directory core block).
const CATEGORY_VALUE_KEYS: Record<string, string[]> = {
  [CATEGORY_LISTINGS_BLOCK_TYPE]: [],
  [CATEGORY_CORE_BLOCK_TYPE]: ['body', 'format'],
  [CATEGORY_CHILDREN_GRID_BLOCK_TYPE]: [],
}

// Template-owned config keys per block type (everything the admin editor sets).
// categoryIds is intentionally absent — it is derived from the rendered category.
const CATEGORY_TEMPLATE_CONTENT_KEYS: Record<string, string[]> = {
  [CATEGORY_CORE_BLOCK_TYPE]: ['imageWidth', 'visibility'],
  [CATEGORY_CHILDREN_GRID_BLOCK_TYPE]: [
    'title',
    'columns',
    'mobileColumns',
    'imageFit',
    'imageHeight',
    'visibility',
  ],
  [CATEGORY_LISTINGS_BLOCK_TYPE]: [
    'title',
    'subtitle',
    'headerAlign',
    'mobileHeaderAlign',
    'contentType',
    'listingStyle',
    'imageFit',
    'imageHeight',
    'saveIconOpacity',
    'categoryChipParentIds',
    'displayMode',
    'itemsToShow',
    'mobileColumns',
    'columns',
    'sortBy',
    'sortOrder',
    'isPaginated',
    'itemsPerPage',
    'viewAllText',
    'viewAllLink',
    'visibility',
  ],
}

const categoryTemplateInheritanceConfig = {
  valueKeys: CATEGORY_VALUE_KEYS,
  templateContentKeys: CATEGORY_TEMPLATE_CONTENT_KEYS,
  getInitialValueEntries: getCategoryNonBlockEntries,
}

// Row-level settings stored alongside blocks in categories.content_blocks:
// _-prefixed objects (_settings.is_private) and bare scalars (show_featured_image).
// These must survive every prune/merge or private categories silently go public.
export function getCategoryNonBlockEntries(contentBlocks: Record<string, any> = {}) {
  return getTemplateNonBlockEntries(contentBlocks, (key, value) => key.startsWith('_') || typeof value !== 'object' || value === null)
}

// Strip per-category value keys from template blocks so templates only store structure
export function sanitizeCategoryTemplateBlocks(contentBlocks: Record<string, any> = {}) {
  return sanitizeTemplateBlocks(contentBlocks, categoryTemplateInheritanceConfig)
}

// Convert builder blocks to the value-only JSON stored on the category row
export function categoryBlocksToValueJson(blocks: Array<{ id: string; type: string; content: Record<string, any> }>) {
  return blocksToTemplateValueJson(blocks, categoryTemplateInheritanceConfig)
}

// Drop value entries for blocks no longer in the template, keeping row settings
export function pruneCategoryValueBlocksForTemplate(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>
) {
  return pruneTemplateValueBlocks(valueBlocks, templateBlocks, categoryTemplateInheritanceConfig)
}

// Merge template structure with category values for rendering/editing
export function mergeCategoryTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>
) {
  return mergeTemplateBlocks(templateBlocks, valueBlocks, categoryTemplateInheritanceConfig)
}

// Template-editor preview: per-category values are empty in templates, so the
// preview substitutes sample content (mirrors withDirectoryTemplatePreviewValues).
const CATEGORY_TEMPLATE_PREVIEW_RICH_TEXT = `
<p>This is sample category content. Use this block to decide where the category introduction should appear in the template.</p>
<p>Real text is edited on each category.</p>
`.trim()

export const CATEGORY_TEMPLATE_PREVIEW_CATEGORY = {
  title: 'Preview Category',
  featuredImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
}

export function withCategoryTemplatePreviewValues<TBlock extends { type: string; content: Record<string, any> }>(
  blocks: TBlock[]
) {
  return blocks.map((block) => {
    if (block.type !== CATEGORY_CORE_BLOCK_TYPE || hasTemplateValue(block.content?.body)) return block

    return {
      ...block,
      content: {
        ...(block.content || {}),
        body: CATEGORY_TEMPLATE_PREVIEW_RICH_TEXT,
      },
    }
  })
}
