import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categoryTemplates } from '@/lib/db/schema'
import { CATEGORY_BLANK_TEMPLATE_NAME } from './category-template-inheritance'

// Every site needs at least one category template (categories.template_id is NOT NULL).
// Creates the 'Blank' template on demand, marking it default when no default exists.
export async function ensureCategoryBlankTemplateForSite(siteId: string) {
  const [blankTemplate] = await db
    .select()
    .from(categoryTemplates)
    .where(and(eq(categoryTemplates.siteId, siteId), eq(categoryTemplates.name, CATEGORY_BLANK_TEMPLATE_NAME)))
    .limit(1)

  if (blankTemplate) return blankTemplate

  const [defaultTemplate] = await db
    .select({ id: categoryTemplates.id })
    .from(categoryTemplates)
    .where(and(eq(categoryTemplates.siteId, siteId), eq(categoryTemplates.isDefault, true)))
    .orderBy(desc(categoryTemplates.updatedAt))
    .limit(1)

  const [createdTemplate] = await db
    .insert(categoryTemplates)
    .values({
      siteId,
      name: CATEGORY_BLANK_TEMPLATE_NAME,
      contentBlocks: {},
      isDefault: !defaultTemplate,
    })
    .returning()

  return createdTemplate
}

// Resolve the template to assign when a category is created without an explicit
// choice (Google Maps import, inline pickers): site default, else ensured Blank.
export async function getDefaultCategoryTemplateIdForSite(siteId: string) {
  const [defaultTemplate] = await db
    .select({ id: categoryTemplates.id })
    .from(categoryTemplates)
    .where(and(eq(categoryTemplates.siteId, siteId), eq(categoryTemplates.isDefault, true)))
    .orderBy(desc(categoryTemplates.updatedAt))
    .limit(1)

  if (defaultTemplate) return defaultTemplate.id

  const blankTemplate = await ensureCategoryBlankTemplateForSite(siteId)
  return blankTemplate.id
}
