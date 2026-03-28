'use server'

import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterSkills, newsletterSkillOutputs, newsletters, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { generateNewsletterBatchContent } from '@/lib/actions/ai/newsletter-ai-actions'
import { isAIProvider } from '@/lib/ai/models'
import { getDefaultTemplate } from '@/lib/actions/newsletters/template-actions'

// --- Types ---

export interface NewsletterSkill {
  id: string
  site_id: string
  name: string
  prompt: string
  quantity: number
  reference_text: string | null
  settings: Record<string, any>
  status: string
  created_at: string
  updated_at: string
}

export interface NewsletterSkillOutput {
  id: string
  skill_id: string
  site_id: string
  subject: string
  content_blocks: Record<string, any>
  status: string
  newsletter_id: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// --- Helpers ---

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function rowToSkill(row: any): NewsletterSkill {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    prompt: row.prompt,
    quantity: row.quantity,
    reference_text: row.referenceText ?? null,
    settings: (row.settings as Record<string, any>) ?? {},
    status: row.status ?? 'active',
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

function rowToOutput(row: any): NewsletterSkillOutput {
  return {
    id: row.id,
    skill_id: row.skillId,
    site_id: row.siteId,
    subject: row.subject,
    content_blocks: (row.contentBlocks as Record<string, any>) ?? {},
    status: row.status ?? 'pending',
    newsletter_id: row.newsletterId ?? null,
    metadata: (row.metadata as Record<string, any>) ?? {},
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

// --- CRUD ---

export async function createSkill(input: {
  siteId: string
  name: string
  prompt: string
  quantity?: number
  referenceText?: string
  settings?: Record<string, any>
}): Promise<{ data: NewsletterSkill | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.name?.trim()) return { data: null, error: 'Name is required' }
    if (!input.prompt?.trim()) return { data: null, error: 'Prompt is required' }

    const [row] = await db
      .insert(newsletterSkills)
      .values({
        siteId: input.siteId,
        name: input.name.trim(),
        prompt: input.prompt.trim(),
        quantity: input.quantity ?? 1,
        referenceText: input.referenceText || null,
        settings: input.settings ?? {},
      })
      .returning()

    if (!row) return { data: null, error: 'Failed to create skill' }

    return { data: rowToSkill(row), error: null }
  } catch (err) {
    console.error('createSkill error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateSkill(
  skillId: string,
  updates: {
    name?: string
    prompt?: string
    quantity?: number
    referenceText?: string | null
    settings?: Record<string, any>
    status?: string
  }
): Promise<{ data: NewsletterSkill | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(skillId)) return { data: null, error: 'Invalid skill ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Fetch skill to verify ownership
    const [existing] = await db
      .select()
      .from(newsletterSkills)
      .where(eq(newsletterSkills.id, skillId))
      .limit(1)

    if (!existing) return { data: null, error: 'Skill not found' }

    if (!await verifySiteOwnership(existing.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Build update object with only provided fields
    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) allowedFields.name = updates.name.trim()
    if (updates.prompt !== undefined) allowedFields.prompt = updates.prompt.trim()
    if (updates.quantity !== undefined) allowedFields.quantity = updates.quantity
    if (updates.referenceText !== undefined) allowedFields.referenceText = updates.referenceText
    if (updates.settings !== undefined) allowedFields.settings = updates.settings
    if (updates.status !== undefined) allowedFields.status = updates.status

    const [row] = await db
      .update(newsletterSkills)
      .set(allowedFields)
      .where(eq(newsletterSkills.id, skillId))
      .returning()

    if (!row) return { data: null, error: 'Failed to update skill' }

    return { data: rowToSkill(row), error: null }
  } catch (err) {
    console.error('updateSkill error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteSkill(skillId: string): Promise<{ error: string | null }> {
  try {
    if (!UUID_REGEX.test(skillId)) return { error: 'Invalid skill ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { error: 'Not authenticated' }

    const [existing] = await db
      .select()
      .from(newsletterSkills)
      .where(eq(newsletterSkills.id, skillId))
      .limit(1)

    if (!existing) return { error: 'Skill not found' }

    if (!await verifySiteOwnership(existing.siteId, user.id)) {
      return { error: 'Access denied' }
    }

    // Cascade deletes outputs too
    await db.delete(newsletterSkills).where(eq(newsletterSkills.id, skillId))

    return { error: null }
  } catch (err) {
    console.error('deleteSkill error:', err)
    return { error: 'Server error' }
  }
}

export async function getSkillsBySite(
  siteId: string
): Promise<{ data: (NewsletterSkill & { pending_count: number; approved_count: number })[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Fetch skills
    const rows = await db
      .select()
      .from(newsletterSkills)
      .where(eq(newsletterSkills.siteId, siteId))
      .orderBy(desc(newsletterSkills.createdAt))

    // Fetch output counts per skill
    const skillIds = rows.map(r => r.id)
    let countsMap: Record<string, { pending: number; approved: number }> = {}

    if (skillIds.length > 0) {
      const counts = await db
        .select({
          skillId: newsletterSkillOutputs.skillId,
          status: newsletterSkillOutputs.status,
          count: sql<number>`count(*)::int`,
        })
        .from(newsletterSkillOutputs)
        .where(inArray(newsletterSkillOutputs.skillId, skillIds))
        .groupBy(newsletterSkillOutputs.skillId, newsletterSkillOutputs.status)

      for (const row of counts) {
        if (!countsMap[row.skillId]) countsMap[row.skillId] = { pending: 0, approved: 0 }
        if (row.status === 'pending') countsMap[row.skillId].pending = row.count
        if (row.status === 'approved') countsMap[row.skillId].approved = row.count
      }
    }

    const skills = rows.map(r => ({
      ...rowToSkill(r),
      pending_count: countsMap[r.id]?.pending ?? 0,
      approved_count: countsMap[r.id]?.approved ?? 0,
    }))

    return { data: skills, error: null }
  } catch (err) {
    console.error('getSkillsBySite error:', err)
    return { data: null, error: `Server error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function getSkillById(
  skillId: string
): Promise<{ data: NewsletterSkill | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(skillId)) return { data: null, error: 'Invalid skill ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(newsletterSkills)
      .where(eq(newsletterSkills.id, skillId))
      .limit(1)

    if (!row) return { data: null, error: 'Skill not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: rowToSkill(row), error: null }
  } catch (err) {
    console.error('getSkillById error:', err)
    return { data: null, error: 'Server error' }
  }
}

// --- Run Skill ---

/**
 * Generate a single newsletter output for a skill.
 * Called repeatedly by the client to generate one at a time,
 * avoiding server action timeouts on large batches.
 */
export async function generateOneOutput(
  skillId: string,
  iteration: number,
  totalCount: number,
  topic?: { subject: string; description: string }
): Promise<{ data: NewsletterSkillOutput | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(skillId)) return { data: null, error: 'Invalid skill ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [skill] = await db
      .select()
      .from(newsletterSkills)
      .where(eq(newsletterSkills.id, skillId))
      .limit(1)

    if (!skill) return { data: null, error: 'Skill not found' }

    if (!await verifySiteOwnership(skill.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const settings = (skill.settings as Record<string, any>) ?? {}
    const allowedBlockTypes = settings.allowed_block_types || ['newsletter-rich-text']

    // Get default template for header/footer blocks if not generating them
    let headerBlock: Record<string, any> | null = null
    let footerBlock: Record<string, any> | null = null

    if (!allowedBlockTypes.includes('newsletter-header') || !allowedBlockTypes.includes('newsletter-footer')) {
      const { data: template } = await getDefaultTemplate(skill.siteId)
      if (template?.content_blocks) {
        const blocks = Object.values(template.content_blocks) as any[]
        headerBlock = blocks.find((b: any) => b.type === 'newsletter-header') || null
        footerBlock = blocks.find((b: any) => b.type === 'newsletter-footer') || null
      }
    }

    // Build prompt — use the topic from the outline if provided
    let iterationPrompt: string
    if (topic) {
      iterationPrompt = `${skill.prompt}\n\n[Newsletter ${iteration} of ${totalCount}]\nSubject: ${topic.subject}\nBrief: ${topic.description}`
    } else {
      iterationPrompt = totalCount > 1
        ? `${skill.prompt}\n\n[Newsletter ${iteration} of ${totalCount}]`
        : skill.prompt
    }

    const result = await generateNewsletterBatchContent(skill.siteId, {
      prompt: iterationPrompt,
      voiceGuide: skill.referenceText || undefined,
      referenceText: undefined,
      provider: isAIProvider(settings.provider) ? settings.provider : undefined,
      model: settings.model,
      temperature: settings.temperature,
      allowedBlockTypes,
    })

    if (result.error) {
      return { data: null, error: result.error }
    }

    // Parse the AI response JSON
    const parsed = parseAIResponse(result.content, allowedBlockTypes, headerBlock, footerBlock)
    if (parsed.error) {
      return { data: null, error: parsed.error }
    }

    // Insert as a pending output
    const [row] = await db.insert(newsletterSkillOutputs).values({
      skillId: skill.id,
      siteId: skill.siteId,
      subject: parsed.subject!,
      contentBlocks: parsed.contentBlocks!,
      status: 'pending',
      metadata: {
        provider: isAIProvider(settings.provider) ? settings.provider : 'default',
        model: settings.model || 'default',
        generated_at: new Date().toISOString(),
        iteration,
      },
    }).returning()

    if (!row) return { data: null, error: 'Failed to save output' }

    return { data: rowToOutput(row), error: null }
  } catch (err) {
    console.error('generateOneOutput error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Parse AI response JSON into subject + content_blocks */
function parseAIResponse(
  content: string,
  allowedBlockTypes: string[],
  headerBlock: Record<string, any> | null,
  footerBlock: Record<string, any> | null
): { subject: string | null; contentBlocks: Record<string, any> | null; error: string | null } {
  try {
    // Strip potential markdown code fences
    let cleaned = content.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
    }

    // Try to extract JSON if the AI wrapped it in extra text
    if (!cleaned.startsWith('{')) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        cleaned = jsonMatch[0]
      }
    }

    let parsed = JSON.parse(cleaned)

    // Handle wrapped formats: { "newsletters": [...] } or { "newsletter": {...} }
    if (parsed.newsletters && Array.isArray(parsed.newsletters)) {
      parsed = parsed.newsletters[0]
    } else if (parsed.newsletter && typeof parsed.newsletter === 'object') {
      parsed = parsed.newsletter
    }

    if (!parsed || !parsed.subject || !parsed.blocks || !Array.isArray(parsed.blocks)) {
      return { subject: null, contentBlocks: null, error: 'Invalid AI response format — missing subject or blocks' }
    }

    // Build content_blocks in the same format as the newsletter editor
    const contentBlocks: Record<string, any> = {}
    let displayOrder = 0

    // Add header from template if not AI-generated
    if (!allowedBlockTypes.includes('newsletter-header') && headerBlock) {
      const id = `newsletter-header-${Date.now()}`
      contentBlocks[id] = { ...headerBlock, id, display_order: displayOrder++ }
    }

    // Add AI-generated blocks
    for (const block of parsed.blocks) {
      if (!block.type || !allowedBlockTypes.includes(block.type)) continue
      const id = `${block.type}-${Date.now() + displayOrder}`
      contentBlocks[id] = {
        id,
        type: block.type,
        content: block.content || {},
        display_order: displayOrder++,
      }
    }

    // Add footer from template if not AI-generated
    if (!allowedBlockTypes.includes('newsletter-footer') && footerBlock) {
      const id = `newsletter-footer-${Date.now() + 999}`
      contentBlocks[id] = { ...footerBlock, id, display_order: displayOrder++ }
    }

    return { subject: parsed.subject, contentBlocks, error: null }
  } catch (err) {
    console.error('parseAIResponse error:', err, 'Content preview:', content.substring(0, 500))
    return { subject: null, contentBlocks: null, error: `Failed to parse AI response as JSON. Preview: ${content.substring(0, 200)}` }
  }
}

// --- Review Queue ---

export async function getSkillOutputs(
  skillId: string,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<{ data: NewsletterSkillOutput[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(skillId)) return { data: null, error: 'Invalid skill ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Verify skill ownership
    const [skill] = await db
      .select()
      .from(newsletterSkills)
      .where(eq(newsletterSkills.id, skillId))
      .limit(1)

    if (!skill) return { data: null, error: 'Skill not found' }

    if (!await verifySiteOwnership(skill.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Build query conditions
    const conditions = [eq(newsletterSkillOutputs.skillId, skillId)]
    if (status) {
      conditions.push(eq(newsletterSkillOutputs.status, status))
    }

    const rows = await db
      .select()
      .from(newsletterSkillOutputs)
      .where(and(...conditions))
      .orderBy(desc(newsletterSkillOutputs.createdAt))

    return { data: rows.map(rowToOutput), error: null }
  } catch (err) {
    console.error('getSkillOutputs error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function approveOutput(
  outputId: string
): Promise<{ data: { newsletter_id: string } | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(outputId)) return { data: null, error: 'Invalid output ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Fetch the output
    const [output] = await db
      .select()
      .from(newsletterSkillOutputs)
      .where(eq(newsletterSkillOutputs.id, outputId))
      .limit(1)

    if (!output) return { data: null, error: 'Output not found' }

    if (!await verifySiteOwnership(output.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (output.status !== 'pending') {
      return { data: null, error: 'Output is not pending' }
    }

    // Create a draft newsletter
    const [newsletter] = await db
      .insert(newsletters)
      .values({
        siteId: output.siteId,
        name: output.subject,
        subject: output.subject,
        content: '',
        contentBlocks: output.contentBlocks ?? {},
        status: 'draft',
      })
      .returning()

    if (!newsletter) return { data: null, error: 'Failed to create newsletter' }

    // Update the output with the newsletter reference
    await db
      .update(newsletterSkillOutputs)
      .set({
        status: 'approved',
        newsletterId: newsletter.id,
        updatedAt: new Date(),
      })
      .where(eq(newsletterSkillOutputs.id, outputId))

    return { data: { newsletter_id: newsletter.id }, error: null }
  } catch (err) {
    console.error('approveOutput error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function rejectOutput(
  outputId: string
): Promise<{ error: string | null }> {
  try {
    if (!UUID_REGEX.test(outputId)) return { error: 'Invalid output ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { error: 'Not authenticated' }

    const [output] = await db
      .select()
      .from(newsletterSkillOutputs)
      .where(eq(newsletterSkillOutputs.id, outputId))
      .limit(1)

    if (!output) return { error: 'Output not found' }

    if (!await verifySiteOwnership(output.siteId, user.id)) {
      return { error: 'Access denied' }
    }

    await db
      .update(newsletterSkillOutputs)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(newsletterSkillOutputs.id, outputId))

    return { error: null }
  } catch (err) {
    console.error('rejectOutput error:', err)
    return { error: 'Server error' }
  }
}

export async function updateOutput(
  outputId: string,
  updates: { subject?: string; content_blocks?: Record<string, any> }
): Promise<{ data: NewsletterSkillOutput | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(outputId)) return { data: null, error: 'Invalid output ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [output] = await db
      .select()
      .from(newsletterSkillOutputs)
      .where(eq(newsletterSkillOutputs.id, outputId))
      .limit(1)

    if (!output) return { data: null, error: 'Output not found' }

    if (!await verifySiteOwnership(output.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.subject !== undefined) allowedFields.subject = updates.subject
    if (updates.content_blocks !== undefined) allowedFields.contentBlocks = updates.content_blocks

    const [row] = await db
      .update(newsletterSkillOutputs)
      .set(allowedFields)
      .where(eq(newsletterSkillOutputs.id, outputId))
      .returning()

    if (!row) return { data: null, error: 'Failed to update output' }

    return { data: rowToOutput(row), error: null }
  } catch (err) {
    console.error('updateOutput error:', err)
    return { data: null, error: 'Server error' }
  }
}
