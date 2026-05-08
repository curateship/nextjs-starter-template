'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { emailSystemTemplates } from '@/lib/db/schema'
import { getAuthenticatedUser, requireAdmin, requireSiteOwnership } from '@/lib/db/helpers'
import {
  getSystemEmailEditorData,
  getSystemEmailList,
  getSystemEmailScopeKey,
  hasSystemEmailTemplateStorage,
  isGlobalSystemEmailTemplate,
  isSystemEmailTemplateKey,
  type SystemEmailTemplateKey,
} from '@/lib/actions/email/system-email'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyTemplateAccess(templateKey: SystemEmailTemplateKey, siteId?: string | null) {
  if (isGlobalSystemEmailTemplate(templateKey)) {
    await requireAdmin()
    return null
  }

  if (!siteId || !UUID_REGEX.test(siteId)) {
    throw new Error('Valid site ID is required')
  }

  const { siteId: ownedSiteId } = await requireSiteOwnership(siteId)
  return ownedSiteId
}

export async function getSystemEmailDashboardAction(siteId: string) {
  try {
    if (!UUID_REGEX.test(siteId)) {
      return { success: false, error: 'Invalid site ID' }
    }

    const { siteId: ownedSiteId } = await requireSiteOwnership(siteId)
    const user = await getAuthenticatedUser()
    const storageReady = await hasSystemEmailTemplateStorage()
    const templates = await getSystemEmailList(ownedSiteId, user?.role === 'super_admin')

    return {
      success: true,
      data: {
        storageReady,
        templates,
      },
    }
  } catch (error) {
    console.error('Error in getSystemEmailDashboardAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load system emails',
    }
  }
}

export async function getSystemEmailEditorAction(templateKeyInput: string, siteId?: string | null) {
  try {
    if (!isSystemEmailTemplateKey(templateKeyInput)) {
      return { success: false, error: 'Unknown system email template' }
    }

    const templateKey = templateKeyInput as SystemEmailTemplateKey
    const resolvedSiteId = await verifyTemplateAccess(templateKey, siteId)
    const storageReady = await hasSystemEmailTemplateStorage()
    const template = await getSystemEmailEditorData(templateKey, resolvedSiteId)

    return {
      success: true,
      data: {
        storageReady,
        template,
      },
    }
  } catch (error) {
    console.error('Error in getSystemEmailEditorAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load system email template',
    }
  }
}

export async function saveSystemEmailTemplateAction(input: {
  templateKey: string
  siteId?: string | null
  subject: string
  contentBlocks: Record<string, any>
  fromName?: string | null
  replyTo?: string | null
}) {
  try {
    if (!isSystemEmailTemplateKey(input.templateKey)) {
      return { success: false, error: 'Unknown system email template' }
    }

    const templateKey = input.templateKey as SystemEmailTemplateKey
    const resolvedSiteId = await verifyTemplateAccess(templateKey, input.siteId)

    if (!await hasSystemEmailTemplateStorage()) {
      return { success: false, error: 'Run db:push before saving system email templates.' }
    }

    const subject = input.subject.trim()
    if (!subject) {
      return { success: false, error: 'Subject is required' }
    }

    const scopeKey = getSystemEmailScopeKey(templateKey, resolvedSiteId)

    const [existing] = await db
      .select({ id: emailSystemTemplates.id })
      .from(emailSystemTemplates)
      .where(and(
        eq(emailSystemTemplates.templateKey, templateKey),
        eq(emailSystemTemplates.scopeKey, scopeKey),
      ))
      .limit(1)

    if (existing) {
      await db
        .update(emailSystemTemplates)
        .set({
          subject,
          contentBlocks: input.contentBlocks || {},
          fromName: input.fromName?.trim() || null,
          replyTo: input.replyTo?.trim() || null,
          updatedAt: new Date(),
          isEnabled: true,
        })
        .where(eq(emailSystemTemplates.id, existing.id))
    } else {
      await db
        .insert(emailSystemTemplates)
        .values({
          templateKey,
          scopeKey,
          siteId: resolvedSiteId,
          subject,
          contentBlocks: input.contentBlocks || {},
          fromName: input.fromName?.trim() || null,
          replyTo: input.replyTo?.trim() || null,
          isEnabled: true,
        })
    }

    revalidatePath('/admin/platforms/emails')
    revalidatePath(`/admin/platforms/emails/${templateKey}`)

    return { success: true }
  } catch (error) {
    console.error('Error in saveSystemEmailTemplateAction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save system email template',
    }
  }
}
