// Sends the two registration emails (immediate confirmation, and the reminder
// before the event) through the same per-site Resend config and editable
// system-email templates every other transactional email in the app uses.
//
// The sender config, the template and everything in the message that does not
// depend on who is receiving it are resolved once by createEventRegistrationMailer.
// The reminder cron emails a whole attendee list in a loop, and re-resolving all
// of that per recipient would be several database round trips each.

import { getEmailProvider } from '@/lib/actions/email/provider'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
  type SystemEmailTemplateKey,
} from '@/lib/actions/email/system-email'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { buildEventLocation, formatEventWhen } from '@/lib/utils/calendar'
import { buildTicketQrUrl, buildTicketUrl } from './event-check-in-core'

export type EventRegistrationEmailKey = Extract<
  SystemEmailTemplateKey,
  'event_registration_confirmation' | 'event_reminder'
>

export interface EventEmailContext {
  slug: string
  title: string
  eventDate?: string | null
  eventTime?: string | null
  venueName?: string | null
  venueAddress?: string | null
}

export interface EventRegistrationMailer {
  /** `checkInCode` is this attendee's ticket, and the only per-recipient token besides their name. */
  send(
    attendeeName: string,
    attendeeEmail: string,
    checkInCode: string,
  ): Promise<{ sent: boolean; error: string | null }>
}

/**
 * Prepare to email one event's registrants.
 *
 * Returns `mailer: null` with a reason rather than throwing, because every caller
 * must carry on when a site has no mail sender configured or the owner has turned
 * the template off — the registration itself still stands. Callers only stamp
 * `confirmation_sent_at` / `reminder_sent_at` on a successful send, so an unsent
 * email is retried later rather than silently skipped.
 */
export async function createEventRegistrationMailer(params: {
  templateKey: EventRegistrationEmailKey
  siteId: string
  event: EventEmailContext
}): Promise<{ mailer: EventRegistrationMailer | null; error: string | null }> {
  const config = await getEmailConfig(params.siteId)
  if (!config?.apiKey || !config.fromEmail) {
    return { mailer: null, error: 'Email sending is not configured for this site' }
  }

  const template = await getSystemEmailTemplate(params.templateKey, params.siteId)
  if (!template.is_enabled) {
    return { mailer: null, error: 'This email template is turned off' }
  }

  // Every token except the attendee's name and their ticket links is the same
  // for the whole list.
  const eventTokens = await buildSystemEmailTokens({
    siteId: params.siteId,
    eventName: params.event.title,
    eventWhen: formatEventWhen(params.event.eventDate, params.event.eventTime) || 'Date to be announced',
    eventLocation:
      buildEventLocation(params.event.venueName || undefined, params.event.venueAddress || undefined) ||
      'To be announced',
    eventSlug: params.event.slug,
  })

  const provider = getEmailProvider(config.apiKey, config.providerType)
  const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail

  const siteUrl = eventTokens.site_url

  return {
    mailer: {
      async send(attendeeName: string, attendeeEmail: string, checkInCode: string) {
        const tokens = {
          ...eventTokens,
          attendee_name: attendeeName,
          // Empty when the site has no resolvable URL: an email with a broken
          // image and a dead link is worse than one with neither.
          ticket_url: siteUrl ? buildTicketUrl(siteUrl, checkInCode) : '',
          ticket_qr_url: siteUrl ? buildTicketQrUrl(siteUrl, checkInCode) : '',
        }
        const result = await provider.send({
          from,
          to: attendeeEmail,
          subject: renderSystemEmailSubject(template.subject, tokens),
          html: renderSystemEmailContent(template, tokens),
          replyTo: template.reply_to || undefined,
        })
        return {
          sent: Boolean(result.success),
          error: result.success ? null : result.error || 'Email delivery failed',
        }
      },
    },
    error: null,
  }
}

/** Send to a single registrant. Thin wrapper for the one-off callers. */
export async function sendEventRegistrationEmail(params: {
  templateKey: EventRegistrationEmailKey
  siteId: string
  event: EventEmailContext
  attendeeName: string
  attendeeEmail: string
  checkInCode: string
}): Promise<{ sent: boolean; error: string | null }> {
  const { mailer, error } = await createEventRegistrationMailer(params)
  if (!mailer) return { sent: false, error }
  return mailer.send(params.attendeeName, params.attendeeEmail, params.checkInCode)
}
