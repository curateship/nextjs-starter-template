'use server'

import { directoryTemplates } from '@/lib/db/schema'
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

export type DirectoryTemplate = TemplateRecord

export async function getDirectoryTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: DirectoryTemplate[] | null; total: number; error: string | null }> {
  return getTemplatesBySite(directoryTemplates, 'getDirectoryTemplatesBySite', siteId, options)
}

export async function getDirectoryTemplateIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  return getTemplateIds(directoryTemplates, 'getDirectoryTemplateIdsAction', siteId)
}

export async function getDirectoryTemplateById(
  templateId: string
): Promise<{ data: DirectoryTemplate | null; error: string | null }> {
  return getTemplateById(directoryTemplates, 'getDirectoryTemplateById', templateId)
}

export async function createDirectoryTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: DirectoryTemplate | null; error: string | null }> {
  return createTemplate(directoryTemplates, 'createDirectoryTemplate', input)
}

export async function updateDirectoryTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: DirectoryTemplate | null; error: string | null }> {
  return updateTemplate(directoryTemplates, 'updateDirectoryTemplate', templateId, updates, {
    trimNameOnUpdate: false,
    validateNameOnUpdate: false,
  })
}

export async function setDefaultDirectoryTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
  return setDefaultTemplate(directoryTemplates, 'setDefaultDirectoryTemplate', templateId)
}

export async function deleteDirectoryTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  return deleteTemplates(directoryTemplates, 'deleteDirectoryTemplates', ids)
}
