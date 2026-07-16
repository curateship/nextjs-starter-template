'use server'

import { and, desc, eq, or, sql } from 'drizzle-orm'
import { revalidatePath } from '@/lib/cache'

import { actionFailure, actionSuccess, type AdminActionResult } from '@/lib/actions/action-result'
import {
  validateCampaignInput,
  type CampaignInput,
  type CampaignRecord,
  type CampaignStatus,
  type PublicCampaign,
} from '@/lib/campaigns/campaigns'
import { db } from '@/lib/db'
import { campaigns, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { UUID_REGEX } from '@/lib/utils/validation'

function rowToPublicCampaign(row: typeof campaigns.$inferSelect): PublicCampaign {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    type: row.type as PublicCampaign['type'],
    content: row.content,
    targeting: row.targeting,
    trigger: row.trigger,
    frequency: row.frequency as PublicCampaign['frequency'],
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

function rowToCampaign(row: typeof campaigns.$inferSelect): CampaignRecord {
  return {
    ...rowToPublicCampaign(row),
    status: row.status as CampaignStatus,
    views: row.views,
    dismissals: row.dismissals,
    submissions: row.submissions,
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function verifySiteOwnership(siteId: string) {
  if (!UUID_REGEX.test(siteId)) return null
  const user = await getAuthenticatedUser()
  if (!user) return null

  const condition = user.role === 'super_admin'
    ? eq(sites.id, siteId)
    : and(eq(sites.id, siteId), eq(sites.userId, user.id))
  const [site] = await db.select({ id: sites.id }).from(sites).where(condition).limit(1)
  return site ?? null
}

async function getOwnedCampaign(campaignId: string) {
  if (!UUID_REGEX.test(campaignId)) return null
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1)
  if (!campaign || !await verifySiteOwnership(campaign.siteId)) return null
  return campaign
}

function revalidateCampaigns() {
  revalidatePath('/admin/campaigns')
  revalidatePath('/', 'layout')
}

export async function getSiteCampaignsAction(siteId: string): Promise<AdminActionResult<CampaignRecord[]>> {
  try {
    if (!await verifySiteOwnership(siteId)) return actionFailure('Site not found or access denied')
    const rows = await db.select().from(campaigns).where(eq(campaigns.siteId, siteId)).orderBy(desc(campaigns.createdAt))
    return actionSuccess(rows.map(rowToCampaign))
  } catch (error) {
    console.error('getSiteCampaignsAction error:', error)
    return actionFailure('Failed to load campaigns')
  }
}

export async function saveCampaignAction(input: CampaignInput, campaignId?: string): Promise<AdminActionResult<CampaignRecord>> {
  try {
    const validated = validateCampaignInput(input)
    if (!validated.ok) return actionFailure(validated.message)
    if (!await verifySiteOwnership(validated.data.siteId)) return actionFailure('Site not found or access denied')

    const values = {
      name: validated.data.name,
      type: validated.data.type,
      content: validated.data.content,
      targeting: validated.data.targeting,
      trigger: validated.data.trigger,
      frequency: validated.data.frequency,
      startsAt: validated.data.startsAt ? new Date(validated.data.startsAt) : null,
      endsAt: validated.data.endsAt ? new Date(validated.data.endsAt) : null,
      status: validated.data.status,
      updatedAt: new Date(),
    }

    let saved: typeof campaigns.$inferSelect | undefined
    if (campaignId) {
      const existing = await getOwnedCampaign(campaignId)
      if (!existing || existing.siteId !== validated.data.siteId) return actionFailure('Campaign not found or access denied')
      ;[saved] = await db.update(campaigns).set(values).where(eq(campaigns.id, campaignId)).returning()
    } else {
      ;[saved] = await db.insert(campaigns).values({ siteId: validated.data.siteId, ...values }).returning()
    }

    if (!saved) return actionFailure('Failed to save campaign')
    revalidateCampaigns()
    return actionSuccess(rowToCampaign(saved))
  } catch (error) {
    console.error('saveCampaignAction error:', error)
    return actionFailure('Failed to save campaign')
  }
}

export async function setCampaignStatusAction(campaignId: string, status: CampaignStatus): Promise<AdminActionResult<CampaignRecord>> {
  try {
    if (status !== 'active' && status !== 'draft') return actionFailure('Invalid status')
    const campaign = await getOwnedCampaign(campaignId)
    if (!campaign) return actionFailure('Campaign not found or access denied')
    const [updated] = await db.update(campaigns).set({ status, updatedAt: new Date() }).where(eq(campaigns.id, campaignId)).returning()
    revalidateCampaigns()
    return actionSuccess(rowToCampaign(updated))
  } catch (error) {
    console.error('setCampaignStatusAction error:', error)
    return actionFailure('Failed to update campaign')
  }
}

export async function deleteCampaignAction(campaignId: string): Promise<AdminActionResult<{ id: string }>> {
  try {
    const campaign = await getOwnedCampaign(campaignId)
    if (!campaign) return actionFailure('Campaign not found or access denied')
    await db.delete(campaigns).where(eq(campaigns.id, campaignId))
    revalidateCampaigns()
    return actionSuccess({ id: campaignId })
  } catch (error) {
    console.error('deleteCampaignAction error:', error)
    return actionFailure('Failed to delete campaign')
  }
}

export async function getPublicCampaignsForSite(siteId: string): Promise<PublicCampaign[]> {
  if (!UUID_REGEX.test(siteId)) return []

  try {
    const now = new Date()
    const rows = await db
      .select()
      .from(campaigns)
      .where(and(
        eq(campaigns.siteId, siteId),
        eq(campaigns.status, 'active'),
        or(sql`${campaigns.startsAt} is null`, sql`${campaigns.startsAt} <= ${now}`),
        or(sql`${campaigns.endsAt} is null`, sql`${campaigns.endsAt} > ${now}`),
      ))
      .orderBy(desc(campaigns.createdAt))
    return rows.map(rowToPublicCampaign)
  } catch (error) {
    console.error('getPublicCampaignsForSite error:', error)
    return []
  }
}
