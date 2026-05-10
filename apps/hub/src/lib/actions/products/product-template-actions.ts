'use server'

import { productTemplates } from '@/lib/db/schema'
import {
  createTemplate,
  deleteTemplates,
  getTemplateById,
  getTemplateIds,
  getTemplatesBySite,
  setDefaultTemplate,
  updateTemplate,
  type TemplateRecord,
} from '@/lib/actions/templates/template-action-helpers'

export type ProductTemplate = TemplateRecord

const MAX_CONTENT_BLOCKS_SIZE = 50000
const ALLOWED_PRODUCT_BLOCK_TYPES = [
  'product-hero',
  'product-details',
  'product-gallery',
  'product-features',
  'product-hotspot',
  'product-checkout',
  'product-lead-magnet',
  'product-faq',
  'product-testimonials',
  'listing-views',
]

function validateProductContentBlocks(contentBlocks: Record<string, any>) {
  if (typeof contentBlocks !== 'object' || contentBlocks === null || Array.isArray(contentBlocks)) {
    return 'Invalid content blocks format'
  }

  if (JSON.stringify(contentBlocks).length > MAX_CONTENT_BLOCKS_SIZE) {
    return 'Content blocks too large'
  }

  for (const [blockKey, blockData] of Object.entries(contentBlocks)) {
    if (typeof blockData !== 'object' || blockData === null || Array.isArray(blockData)) {
      return `Invalid data for block type: ${blockKey}`
    }

    if (blockKey.startsWith('_')) continue

    const blockType = typeof blockData.type === 'string' ? blockData.type : blockKey
    if (!ALLOWED_PRODUCT_BLOCK_TYPES.includes(blockType)) {
      return `Invalid block type: ${blockType}`
    }
  }

  return null
}

export async function getProductTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: ProductTemplate[] | null; total: number; error: string | null }> {
  return getTemplatesBySite(productTemplates, 'getProductTemplatesBySite', siteId, options)
}

export async function getProductTemplateIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  return getTemplateIds(productTemplates, 'getProductTemplateIdsAction', siteId)
}

export async function getProductTemplateById(
  templateId: string
): Promise<{ data: ProductTemplate | null; error: string | null }> {
  return getTemplateById(productTemplates, 'getProductTemplateById', templateId)
}

export async function createProductTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: ProductTemplate | null; error: string | null }> {
  return createTemplate(productTemplates, 'createProductTemplate', input, {
    validateContentBlocks: validateProductContentBlocks,
  })
}

export async function updateProductTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: ProductTemplate | null; error: string | null }> {
  return updateTemplate(productTemplates, 'updateProductTemplate', templateId, updates, {
    validateContentBlocks: validateProductContentBlocks,
  })
}

export async function setDefaultProductTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
  return setDefaultTemplate(productTemplates, 'setDefaultProductTemplate', templateId)
}

export async function deleteProductTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  return deleteTemplates(productTemplates, 'deleteProductTemplates', ids)
}
