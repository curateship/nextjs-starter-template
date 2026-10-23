
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postTemplates } from '@/lib/db/schema'
import {
  POST_BLANK_TEMPLATE_NAME,
  POST_CORE_BLOCK_TYPE,
} from './post-template-inheritance'

const POST_BLANK_TEMPLATE_CONTENT_BLOCKS = {
  'post-core-default': {
    id: 'post-core-default',
    type: POST_CORE_BLOCK_TYPE,
    display_order: 0,
    content: {
      layoutColumn: 'main',
      coreStyle: 'default',
    },
  },
}

export async function ensurePostBlankTemplateForSite(siteId: string) {
  const [blankTemplate] = await db
    .select()
    .from(postTemplates)
    .where(and(eq(postTemplates.siteId, siteId), eq(postTemplates.name, POST_BLANK_TEMPLATE_NAME)))
    .limit(1)

  if (blankTemplate) return blankTemplate

  const [defaultTemplate] = await db
    .select({ id: postTemplates.id })
    .from(postTemplates)
    .where(and(eq(postTemplates.siteId, siteId), eq(postTemplates.isDefault, true)))
    .orderBy(desc(postTemplates.updatedAt))
    .limit(1)

  const [createdTemplate] = await db
    .insert(postTemplates)
    .values({
      siteId,
      name: POST_BLANK_TEMPLATE_NAME,
      contentBlocks: POST_BLANK_TEMPLATE_CONTENT_BLOCKS,
      isDefault: !defaultTemplate,
    })
    .returning()

  return createdTemplate
}
