import { directories, directoryTemplates } from '@/lib/db/schema'
import { sanitizeDirectoryTemplateBlocks } from './directory-template-inheritance'
import { ensureDirectoryBlankTemplateForSite } from './directory-template-ensure'
import { createTemplateActions } from '@/lib/actions/templates/create-template-actions'
import type { TemplateRecord } from '@/lib/actions/templates/template-action-helpers'

export type DirectoryTemplate = TemplateRecord

const actions = createTemplateActions({
  table: directoryTemplates,
  contentTable: directories,
  contentTemplateIdColumn: directories.templateId,
  cacheTag: 'directory',
  entity: 'Directory',
  sanitizeBlocks: sanitizeDirectoryTemplateBlocks,
  ensureBlankTemplateForSite: ensureDirectoryBlankTemplateForSite,
  inUseError: 'Template is used by one or more listings',
  updateOptions: { trimNameOnUpdate: false, validateNameOnUpdate: false },
})

export const getDirectoryTemplatesBySiteImpl = actions.getTemplatesBySiteImpl
export const getDirectoryTemplateIdsActionImpl = actions.getTemplateIdsActionImpl
export const getDirectoryTemplateByIdImpl = actions.getTemplateByIdImpl
export const createDirectoryTemplateImpl = actions.createTemplateImpl
export const updateDirectoryTemplateImpl = actions.updateTemplateImpl
export const setDefaultDirectoryTemplateImpl = actions.setDefaultTemplateImpl
export const deleteDirectoryTemplatesImpl = actions.deleteTemplatesImpl
