import { postTemplates, posts } from '@/lib/db/schema'
import { sanitizePostTemplateBlocks } from './post-template-inheritance'
import { ensurePostBlankTemplateForSite } from './post-template-ensure'
import { createTemplateActions } from '@/lib/actions/templates/create-template-actions'
import type { TemplateRecord } from '@/lib/actions/templates/template-action-helpers'

export type PostTemplate = TemplateRecord

const actions = createTemplateActions({
  table: postTemplates,
  contentTable: posts,
  contentTemplateIdColumn: posts.templateId,
  cacheTag: 'posts',
  entity: 'Post',
  sanitizeBlocks: sanitizePostTemplateBlocks,
  ensureBlankTemplateForSite: ensurePostBlankTemplateForSite,
  inUseError: 'Template is used by one or more posts',
  // Posts deliberately pass no update options — the shared helper's defaults apply.
})

export const getPostTemplatesBySiteImpl = actions.getTemplatesBySiteImpl
export const getPostTemplateIdsActionImpl = actions.getTemplateIdsActionImpl
export const getPostTemplateByIdImpl = actions.getTemplateByIdImpl
export const createPostTemplateImpl = actions.createTemplateImpl
export const updatePostTemplateImpl = actions.updateTemplateImpl
export const setDefaultPostTemplateImpl = actions.setDefaultTemplateImpl
export const deletePostTemplatesImpl = actions.deleteTemplatesImpl
