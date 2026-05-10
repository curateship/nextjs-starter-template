'use server'

import { postTemplates } from '@/lib/db/schema'
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

export type PostTemplate = TemplateRecord

export async function getPostTemplatesBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: PostTemplate[] | null; total: number; error: string | null }> {
  return getTemplatesBySite(postTemplates, 'getPostTemplatesBySite', siteId, options)
}

export async function getPostTemplateIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  return getTemplateIds(postTemplates, 'getPostTemplateIdsAction', siteId)
}

export async function getPostTemplateById(
  templateId: string
): Promise<{ data: PostTemplate | null; error: string | null }> {
  return getTemplateById(postTemplates, 'getPostTemplateById', templateId)
}

export async function createPostTemplate(input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: PostTemplate | null; error: string | null }> {
  return createTemplate(postTemplates, 'createPostTemplate', input)
}

export async function updatePostTemplate(
  templateId: string,
  updates: { name?: string; content_blocks?: Record<string, any> }
): Promise<{ data: PostTemplate | null; error: string | null }> {
  return updateTemplate(postTemplates, 'updatePostTemplate', templateId, updates)
}

export async function setDefaultPostTemplate(templateId: string): Promise<{ success: boolean; error: string | null }> {
  return setDefaultTemplate(postTemplates, 'setDefaultPostTemplate', templateId)
}

export async function deletePostTemplates(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  return deleteTemplates(postTemplates, 'deletePostTemplates', ids)
}
