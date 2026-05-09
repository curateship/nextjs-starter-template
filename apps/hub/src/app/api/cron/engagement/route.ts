import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newsletterContacts } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { syncAllDynamicSegments } from '@/lib/actions/newsletters/segment-actions'

/**
 * GET /api/cron/engagement
 * Recalculate engagement scores for all contacts. Runs daily.
 * Score 0-100 based on recency + frequency of opens/clicks.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Get all contacts
    const contacts = await db
      .select({
        id: newsletterContacts.id,
        siteId: newsletterContacts.siteId,
        status: newsletterContacts.status,
        bounceCount: newsletterContacts.bounceCount,
        lastEngagedAt: newsletterContacts.lastEngagedAt,
        engagementScore: newsletterContacts.engagementScore,
        metadata: newsletterContacts.metadata,
      })
      .from(newsletterContacts)
      .where(inArray(newsletterContacts.status, ['active', 'unsubscribed']))

    if (!contacts.length) {
      return NextResponse.json({ message: 'No contacts to score', updated: 0 })
    }

    // Calculate scores
    let updated = 0
    for (const contact of contacts) {
      const metadata = contact.metadata && typeof contact.metadata === 'object' && !Array.isArray(contact.metadata)
        ? contact.metadata as Record<string, any>
        : {}
      const activity = Array.isArray(metadata.recent_email_activity) ? metadata.recent_email_activity : []

      let score = 0
      for (const entry of activity) {
        if (entry?.opened_at) {
          const openedAt = new Date(entry.opened_at)
          if (Number.isNaN(openedAt.getTime())) continue
          const daysAgo = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60 * 24)
          const decay = Math.max(0, 1 - daysAgo / 90)
          score += 20 * decay
        }
      }

      const finalScore = Math.min(100, Math.round(score))

      if (finalScore !== (contact.engagementScore ?? 0)) {
        await db
          .update(newsletterContacts)
          .set({ engagementScore: finalScore })
          .where(eq(newsletterContacts.id, contact.id))
        updated++
      }
    }

    await syncAllDynamicSegments()

    return NextResponse.json({ message: `Updated ${updated} contact scores`, updated })
  } catch (err) {
    console.error('Engagement cron error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
