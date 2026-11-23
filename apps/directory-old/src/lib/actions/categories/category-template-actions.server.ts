import { categories, categoryTemplates } from '@/lib/db/schema'
import { sanitizeCategoryTemplateBlocks } from './category-template-inheritance'
import { ensureCategoryBlankTemplateForSite } from './category-template-ensure'
import { createTemplateActions } from '@/lib/actions/templates/create-template-actions'
import type { TemplateRecord } from '@/lib/actions/templates/template-action-helpers'

export type CategoryTemplate = TemplateRecord

const actions = createTemplateActions({
  table: categoryTemplates,
  contentTable: categories,
  contentTemplateIdColumn: categories.templateId,
  cacheTag: 'categories',
  entity: 'Category',
  sanitizeBlocks: sanitizeCategoryTemplateBlocks,
  ensureBlankTemplateForSite: ensureCategoryBlankTemplateForSite,
  inUseError: 'Template is used by one or more categories',
  updateOptions: { trimNameOnUpdate: false, validateNameOnUpdate: false },
})

export const getCategoryTemplatesBySiteImpl = actions.getTemplatesBySiteImpl
export const getCategoryTemplateIdsActionImpl = actions.getTemplateIdsActionImpl
export const getCategoryTemplateByIdImpl = actions.getTemplateByIdImpl
export const createCategoryTemplateImpl = actions.createTemplateImpl
export const updateCategoryTemplateImpl = actions.updateTemplateImpl
export const setDefaultCategoryTemplateImpl = actions.setDefaultTemplateImpl
export const deleteCategoryTemplatesImpl = actions.deleteTemplatesImpl
