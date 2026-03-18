import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newsletterContacts, newsletterEvents } from '@/lib/db/schema'
import { eq, and, inArray, gte } from 'drizzle-orm'

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
      })
      .from(newsletterContacts)
      .where(inArray(newsletterContacts.status, ['active', 'unsubscribed']))

    if (!contacts.length) {
      return NextResponse.json({ message: 'No contacts to score', updated: 0 })
    }

    // Get events from last 90 days
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    const events = await db
      .select({
        contactId: newsletterEvents.contactId,
        eventType: newsletterEvents.eventType,
        createdAt: newsletterEvents.createdAt,
      })
      .from(newsletterEvents)
      .where(and(
        inArray(newsletterEvents.eventType, ['opened', 'clicked']),
        gte(newsletterEvents.createdAt, ninetyDaysAgo),
      ))

    // Group events by contact
    const eventsByContact = new Map<string, { type: string; date: Date }[]>()
    for (const event of events) {
      if (!event.contactId) continue
      const list = eventsByContact.get(event.contactId) || []
      list.push({ type: event.eventType, date: new Date(event.createdAt) })
      eventsByContact.set(event.contactId, list)
    }

    // Calculate scores
    let updated = 0
    for (const contact of contacts) {
      const contactEvents = eventsByContact.get(contact.id) || []

      let score = 0
      for (const event of contactEvents) {
        const daysAgo = (now.getTime() - event.date.getTime()) / (1000 * 60 * 60 * 24)
        const decay = Math.max(0, 1 - daysAgo / 90)

        if (event.type === 'clicked') {
          score += 30 * decay
        } else if (event.type === 'opened') {
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

    return NextResponse.json({ message: `Updated ${updated} contact scores`, updated })
  } catch (err) {
    console.error('Engagement cron error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
