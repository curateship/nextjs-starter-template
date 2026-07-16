
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directoryTemplates } from '@/lib/db/schema'
import { DIRECTORY_BLANK_TEMPLATE_NAME } from './directory-template-inheritance'

export async function ensureDirectoryBlankTemplateForSite(siteId: string) {
  const [blankTemplate] = await db
    .select()
    .from(directoryTemplates)
    .where(and(eq(directoryTemplates.siteId, siteId), eq(directoryTemplates.name, DIRECTORY_BLANK_TEMPLATE_NAME)))
    .limit(1)

  if (blankTemplate) return blankTemplate

  const [defaultTemplate] = await db
    .select({ id: directoryTemplates.id })
    .from(directoryTemplates)
    .where(and(eq(directoryTemplates.siteId, siteId), eq(directoryTemplates.isDefault, true)))
    .orderBy(desc(directoryTemplates.updatedAt))
    .limit(1)

  const [createdTemplate] = await db
    .insert(directoryTemplates)
    .values({
      siteId,
      name: DIRECTORY_BLANK_TEMPLATE_NAME,
      contentBlocks: {},
      isDefault: !defaultTemplate,
    })
    .returning()

  return createdTemplate
}
