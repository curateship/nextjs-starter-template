import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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

    // Get all contacts with their recent events
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('newsletter_contacts')
      .select('id, site_id, status, bounce_count, last_engaged_at')
      .in('status', ['active', 'unsubscribed'])

    if (contactsError) {
      console.error('Engagement cron contacts error:', contactsError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!contacts?.length) {
      return NextResponse.json({ message: 'No contacts to score', updated: 0 })
    }

    // Get events from last 90 days grouped by contact
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const { data: events, error: eventsError } = await supabaseAdmin
      .from('newsletter_events')
      .select('contact_id, event_type, created_at')
      .in('event_type', ['opened', 'clicked'])
      .gte('created_at', ninetyDaysAgo)

    if (eventsError) {
      console.error('Engagement cron events error:', eventsError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Group events by contact
    const eventsByContact = new Map<string, { type: string; date: Date }[]>()
    for (const event of events ?? []) {
      if (!event.contact_id) continue
      const list = eventsByContact.get(event.contact_id) || []
      list.push({ type: event.event_type, date: new Date(event.created_at) })
      eventsByContact.set(event.contact_id, list)
    }

    // Calculate scores
    let updated = 0
    for (const contact of contacts) {
      const contactEvents = eventsByContact.get(contact.id) || []

      let score = 0
      for (const event of contactEvents) {
        const daysAgo = (now.getTime() - event.date.getTime()) / (1000 * 60 * 60 * 24)
        // Decay: full points if recent, less as time passes
        const decay = Math.max(0, 1 - daysAgo / 90)

        if (event.type === 'clicked') {
          score += 30 * decay
        } else if (event.type === 'opened') {
          score += 20 * decay
        }
      }

      // Cap at 100
      const finalScore = Math.min(100, Math.round(score))

      // Only update if score changed
      if (finalScore !== (contact as any).engagement_score) {
        await supabaseAdmin
          .from('newsletter_contacts')
          .update({ engagement_score: finalScore })
          .eq('id', contact.id)
        updated++
      }
    }

    return NextResponse.json({ message: `Updated ${updated} contact scores`, updated })
  } catch (err) {
    console.error('Engagement cron error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
