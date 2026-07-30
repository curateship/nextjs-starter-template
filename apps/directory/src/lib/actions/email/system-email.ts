import { and, eq, sql } from 'drizzle-orm'
import { generateEmailHtml, sortNewsletterBlocks } from '@/lib/actions/newsletters/render'
import { db } from '@/lib/db'
import { emailSystemTemplates, products, sites } from '@/lib/db/schema'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

export type SystemEmailTemplateKey =
  | 'password_reset'
  | 'email_verification'
  | 'email_change_confirmation'
  | 'magic_link'
  | 'lead_magnet_delivery'
  | 'product_email_modal_delivery'
  | 'paid_purchase_delivery'
  | 'pages_hero_email'
  | 'featured_listing_renewal_reminder'
  | 'event_registration_confirmation'
  | 'event_reminder'

export interface SystemEmailTemplateRecord {
  id: string | null
  template_key: SystemEmailTemplateKey
  scope_key: string
  site_id: string | null
  subject: string
  content_blocks: Record<string, any>
  from_name: string | null
  reply_to: string | null
  updated_at: string | null
  is_enabled: boolean
}

export interface SystemEmailListItem extends SystemEmailTemplateRecord {
  name: string
  description: string
  scope_label: string
  editable: boolean
}

export interface SystemEmailEditorData extends SystemEmailTemplateRecord {
  name: string
  description: string
  scope_label: string
  tokens: string[]
}

interface DefaultTemplateDefinition {
  name: string
  description: string
  scopeLabel: string
  subject: string
  bodyHtml: string
  tokens: string[]
}

const GLOBAL_SCOPE_KEY = 'global'

const SYSTEM_EMAIL_TEMPLATE_KEYS: SystemEmailTemplateKey[] = [
  'password_reset',
  'email_verification',
  'email_change_confirmation',
  'magic_link',
  'lead_magnet_delivery',
  'product_email_modal_delivery',
  'paid_purchase_delivery',
  'pages_hero_email',
  'featured_listing_renewal_reminder',
  'event_registration_confirmation',
  'event_reminder',
]

export function isGlobalSystemEmailTemplate(templateKey: SystemEmailTemplateKey) {
  return (
    templateKey === 'password_reset' ||
    templateKey === 'email_verification' ||
    templateKey === 'email_change_confirmation' ||
    templateKey === 'magic_link'
  )
}

function buildDefaultBlocks(htmlContent: string) {
  return {
    'newsletter-rich-text-default': {
      id: 'newsletter-rich-text-default',
      type: 'newsletter-rich-text',
      content: {
        htmlContent,
        backgroundColor: '#ffffff',
        padding: 20,
        imageBorderSize: 0,
        imageBorderColor: '#fafafa',
      },
      display_order: 0,
    },
  }
}

function getDefaultTemplateDefinition(templateKey: SystemEmailTemplateKey): DefaultTemplateDefinition {
  if (templateKey === 'password_reset') {
    return {
      name: 'Password Reset',
      description: 'Sent when a user requests a password reset.',
      scopeLabel: 'App-wide',
      subject: 'Reset your password',
      bodyHtml: '<p>You requested a password reset.</p><p><a href="{{reset_url}}">Reset your password</a></p>',
      tokens: ['{{app_name}}', '{{reset_url}}'],
    }
  }

  if (templateKey === 'email_verification') {
    return {
      name: 'Email Confirmation',
      description: 'Sent after signup to confirm a user email address.',
      scopeLabel: 'App-wide',
      subject: 'Verify your email',
      bodyHtml: '<p>Verify your email to finish creating your account.</p><p><a href="{{verification_url}}">Verify your email</a></p><p>If you did not create this account, you can ignore this email.</p>',
      tokens: ['{{app_name}}', '{{verification_url}}'],
    }
  }

  if (templateKey === 'email_change_confirmation') {
    return {
      name: 'Email Change Confirmation',
      description: 'Sent to the current email address before a user changes their email.',
      scopeLabel: 'App-wide',
      subject: 'Confirm your email change',
      bodyHtml: '<p>Confirm that you want to change your email from {{current_email}} to {{new_email}}.</p><p><a href="{{confirmation_url}}">Confirm email change</a></p><p>If you did not request this change, you can ignore this email.</p>',
      tokens: ['{{app_name}}', '{{current_email}}', '{{new_email}}', '{{confirmation_url}}'],
    }
  }

  if (templateKey === 'magic_link') {
    return {
      name: 'Magic Link Sign-in',
      description: 'Sent when a user requests a one-click sign-in link.',
      scopeLabel: 'App-wide',
      subject: 'Your sign-in link',
      bodyHtml: '<p>Click the link below to sign in. It expires shortly and can only be used once.</p><p><a href="{{magic_link_url}}">Sign in</a></p><p>If you did not request this, you can ignore this email.</p>',
      tokens: ['{{app_name}}', '{{magic_link_url}}'],
    }
  }

  if (templateKey === 'lead_magnet_delivery') {
    return {
      name: 'Lead Magnet Delivery',
      description: 'Sent after someone signs up for a lead magnet.',
      scopeLabel: 'Current Site',
      subject: 'Your {{product_name}} is ready',
      bodyHtml: '<p>Your {{product_name}} is ready.</p>{{product_delivery_email}}',
      tokens: ['{{product_name}}', '{{product_delivery_email}}', '{{site_name}}', '{{site_url}}', '{{product_url}}'],
    }
  }

  if (templateKey === 'product_email_modal_delivery') {
    return {
      name: 'Product Email Modal Delivery',
      description: 'Sent after someone subscribes through a product email modal.',
      scopeLabel: 'Current Site',
      subject: 'Here is {{product_name}}',
      bodyHtml: '<p>Thanks for your interest in {{product_name}}.</p>{{product_delivery_email}}',
      tokens: ['{{product_name}}', '{{product_delivery_email}}', '{{site_name}}', '{{site_url}}', '{{product_url}}', '{{subscriber_email}}'],
    }
  }

  if (templateKey === 'pages_hero_email') {
    return {
      name: 'Pages Hero Email',
      description: 'Sent after someone subscribes through a Pages hero email form.',
      scopeLabel: 'Current Site',
      subject: 'Welcome to {{site_name}}',
      bodyHtml: '<p>Thanks for subscribing to {{site_name}}.</p>{{pages_hero_content}}',
      tokens: ['{{pages_hero_content}}', '{{site_name}}', '{{site_url}}', '{{subscriber_email}}', '{{email_form_identifier}}'],
    }
  }

  if (templateKey === 'featured_listing_renewal_reminder') {
    return {
      name: 'Featured Listing Renewal Reminder',
      description: 'Sent to a listing owner before their paid Featured placement expires.',
      scopeLabel: 'Current Site',
      subject: 'Your featured placement for {{listing_name}} expires {{expires_at}}',
      bodyHtml: '<p>Your featured placement for <strong>{{listing_name}}</strong> ({{plan_name}}) expires on <strong>{{expires_at}}</strong>.</p><p>Renew now to keep {{listing_name}} showing first with its Featured badge on {{site_name}}.</p><p><a href="{{renewal_url}}">Renew your featured placement</a></p>',
      tokens: ['{{listing_name}}', '{{plan_name}}', '{{expires_at}}', '{{renewal_url}}', '{{site_name}}', '{{site_url}}'],
    }
  }

  if (templateKey === 'event_registration_confirmation') {
    return {
      name: 'Event Registration Confirmation',
      description: 'Sent immediately after someone RSVPs to an event or buys a ticket.',
      scopeLabel: 'Current Site',
      subject: "You're registered for {{event_name}}",
      bodyHtml: '<p>Hi {{attendee_name}}, you are registered for <strong>{{event_name}}</strong>.</p><p><strong>When:</strong> {{event_when}}<br /><strong>Where:</strong> {{event_location}}</p><p>Show this code at the door:</p><p><a href="{{ticket_url}}"><img src="{{ticket_qr_url}}" alt="Your ticket QR code" width="180" height="180" style="width:180px;height:180px;" /></a></p><p><a href="{{ticket_url}}">Open your ticket</a> &middot; <a href="{{event_url}}">View the event page</a> &middot; <a href="{{event_calendar_url}}">Add it to your calendar</a></p>',
      tokens: ['{{attendee_name}}', '{{event_name}}', '{{event_when}}', '{{event_location}}', '{{ticket_url}}', '{{ticket_qr_url}}', '{{event_url}}', '{{event_calendar_url}}', '{{site_name}}', '{{site_url}}'],
    }
  }

  if (templateKey === 'event_reminder') {
    return {
      name: 'Event Reminder',
      description: 'Sent to everyone registered for an event shortly before it starts.',
      scopeLabel: 'Current Site',
      subject: '{{event_name}} is coming up',
      bodyHtml: '<p>Hi {{attendee_name}}, a quick reminder that <strong>{{event_name}}</strong> is coming up.</p><p><strong>When:</strong> {{event_when}}<br /><strong>Where:</strong> {{event_location}}</p><p><a href="{{ticket_url}}">Open your ticket</a> &middot; <a href="{{event_url}}">View the event page</a> &middot; <a href="{{event_calendar_url}}">Add it to your calendar</a></p>',
      tokens: ['{{attendee_name}}', '{{event_name}}', '{{event_when}}', '{{event_location}}', '{{ticket_url}}', '{{ticket_qr_url}}', '{{event_url}}', '{{event_calendar_url}}', '{{site_name}}', '{{site_url}}'],
    }
  }

  return {
    name: 'Paid Purchase Delivery',
    description: 'Sent after a paid product checkout succeeds.',
    scopeLabel: 'Current Site',
    subject: 'Your {{product_name}} is ready',
    bodyHtml: '<p>Thank you for purchasing {{product_name}}.</p>{{download_page_content}}',
    tokens: ['{{product_name}}', '{{tier_name}}', '{{site_name}}', '{{site_url}}', '{{product_url}}', '{{download_page_content}}'],
  }
}

export function isSystemEmailTemplateKey(value: string): value is SystemEmailTemplateKey {
  return SYSTEM_EMAIL_TEMPLATE_KEYS.includes(value as SystemEmailTemplateKey)
}

export function getSystemEmailScopeKey(templateKey: SystemEmailTemplateKey, siteId?: string | null) {
  return isGlobalSystemEmailTemplate(templateKey) ? GLOBAL_SCOPE_KEY : (siteId || '')
}

function rowToSystemEmailTemplate(row: typeof emailSystemTemplates.$inferSelect): SystemEmailTemplateRecord {
  return {
    id: row.id,
    template_key: row.templateKey,
    scope_key: row.scopeKey,
    site_id: row.siteId ?? null,
    subject: row.subject,
    content_blocks: (row.contentBlocks as Record<string, any>) || {},
    from_name: row.fromName ?? null,
    reply_to: row.replyTo ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    is_enabled: row.isEnabled,
  }
}

function buildDefaultTemplateRecord(templateKey: SystemEmailTemplateKey, siteId?: string | null): SystemEmailTemplateRecord {
  const definition = getDefaultTemplateDefinition(templateKey)
  return {
    id: null,
    template_key: templateKey,
    scope_key: getSystemEmailScopeKey(templateKey, siteId),
    site_id: isGlobalSystemEmailTemplate(templateKey) ? null : (siteId ?? null),
    subject: definition.subject,
    content_blocks: buildDefaultBlocks(definition.bodyHtml),
    from_name: null,
    reply_to: null,
    updated_at: null,
    is_enabled: true,
  }
}

export async function hasSystemEmailTemplateStorage() {
  try {
    const result = await db.execute<{ tableName: string | null }>(
      sql`select to_regclass('public.email_system_templates') as "tableName"`
    )
    return Boolean(result.rows[0]?.tableName)
  } catch (error) {
    console.error('Failed to check system email template storage:', error)
    return false
  }
}

async function getStoredTemplate(templateKey: SystemEmailTemplateKey, siteId?: string | null) {
  if (!await hasSystemEmailTemplateStorage()) {
    return null
  }

  const scopeKey = getSystemEmailScopeKey(templateKey, siteId)
  try {
    const [row] = await db
      .select()
      .from(emailSystemTemplates)
      .where(and(
        eq(emailSystemTemplates.templateKey, templateKey),
        eq(emailSystemTemplates.scopeKey, scopeKey),
      ))
      .limit(1)

    return row ? rowToSystemEmailTemplate(row) : null
  } catch (error) {
    console.error('Failed to load stored system email template:', error)
    return null
  }
}

export async function getSystemEmailTemplate(templateKey: SystemEmailTemplateKey, siteId?: string | null) {
  return await getStoredTemplate(templateKey, siteId) || buildDefaultTemplateRecord(templateKey, siteId)
}

export async function getSystemEmailList(siteId: string, canEditAuth: boolean) {
  const templates = await Promise.all([
    getSystemEmailTemplate('password_reset'),
    getSystemEmailTemplate('email_verification'),
    getSystemEmailTemplate('email_change_confirmation'),
    getSystemEmailTemplate('magic_link'),
    getSystemEmailTemplate('lead_magnet_delivery', siteId),
    getSystemEmailTemplate('product_email_modal_delivery', siteId),
    getSystemEmailTemplate('paid_purchase_delivery', siteId),
    getSystemEmailTemplate('pages_hero_email', siteId),
    getSystemEmailTemplate('featured_listing_renewal_reminder', siteId),
    getSystemEmailTemplate('event_registration_confirmation', siteId),
    getSystemEmailTemplate('event_reminder', siteId),
  ])

  return templates.map((template) => {
    const definition = getDefaultTemplateDefinition(template.template_key)
    return {
      ...template,
      name: definition.name,
      description: definition.description,
      scope_label: definition.scopeLabel,
      editable: isGlobalSystemEmailTemplate(template.template_key) ? canEditAuth : true,
    } satisfies SystemEmailListItem
  })
}

export async function getSystemEmailEditorData(templateKey: SystemEmailTemplateKey, siteId?: string | null) {
  const definition = getDefaultTemplateDefinition(templateKey)
  const template = await getSystemEmailTemplate(templateKey, siteId)
  return {
    ...template,
    name: definition.name,
    description: definition.description,
    scope_label: definition.scopeLabel,
    tokens: definition.tokens,
  } satisfies SystemEmailEditorData
}

function interpolateString(value: string, tokens: Record<string, string>) {
  return Object.entries(tokens).reduce((output, [key, replacement]) => {
    return output.replaceAll(`{{${key}}}`, replacement)
  }, value)
}

function interpolateValue(value: unknown, tokens: Record<string, string>): unknown {
  if (typeof value === 'string') return interpolateString(value, tokens)
  if (Array.isArray(value)) return value.map((entry) => interpolateValue(entry, tokens))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, interpolateValue(entry, tokens)])
    )
  }
  return value
}

function normalizeTransactionalBlocks(contentBlocks: Record<string, any>) {
  const interpolated = interpolateValue(contentBlocks, {}) as Record<string, any>
  return Object.fromEntries(
    Object.entries(interpolated).map(([key, block]) => {
      if (block && typeof block === 'object' && (block as any).type === 'newsletter-footer') {
        return [key, {
          ...(block as Record<string, any>),
          content: {
            ...((block as any).content || {}),
            showUnsubscribe: false,
          },
        }]
      }
      return [key, block]
    })
  )
}

export function renderSystemEmailContent(
  template: Pick<SystemEmailTemplateRecord, 'content_blocks'>,
  tokens: Record<string, string>
) {
  const interpolatedBlocks = interpolateValue(template.content_blocks, tokens) as Record<string, any>
  const transactionalBlocks = normalizeTransactionalBlocks(interpolatedBlocks)
  return generateEmailHtml(sortNewsletterBlocks(transactionalBlocks))
}

export function renderSystemEmailSubject(subject: string, tokens: Record<string, string>) {
  return interpolateString(subject, tokens)
}

export async function buildSystemEmailTokens(params: {
  siteId?: string | null
  resetUrl?: string | null
  verificationUrl?: string | null
  confirmationUrl?: string | null
  magicLinkUrl?: string | null
  currentEmail?: string | null
  newEmail?: string | null
  productId?: string | null
  productName?: string | null
  productSlug?: string | null
  productDeliveryEmail?: string | null
  tierName?: string | null
  downloadPageContent?: string | null
  subscriberEmail?: string | null
  emailFormIdentifier?: string | null
  pagesHeroContent?: string | null
  listingName?: string | null
  planName?: string | null
  expiresAt?: string | null
  attendeeName?: string | null
  eventName?: string | null
  eventWhen?: string | null
  eventLocation?: string | null
  eventSlug?: string | null
}) {
  const tokens: Record<string, string> = {
    app_name: 'System Everything',
    reset_url: params.resetUrl || '',
    verification_url: params.verificationUrl || '',
    confirmation_url: params.confirmationUrl || '',
    magic_link_url: params.magicLinkUrl || '',
    current_email: params.currentEmail || '',
    new_email: params.newEmail || '',
    site_name: '',
    site_url: '',
    product_name: params.productName || '',
    product_delivery_email: params.productDeliveryEmail || '',
    product_url: '',
    tier_name: params.tierName || '',
    download_page_content: params.downloadPageContent || '',
    subscriber_email: params.subscriberEmail || '',
    email_form_identifier: params.emailFormIdentifier || '',
    pages_hero_content: params.pagesHeroContent || '',
    listing_name: params.listingName || '',
    plan_name: params.planName || '',
    expires_at: params.expiresAt || '',
    renewal_url: '',
    attendee_name: params.attendeeName || '',
    event_name: params.eventName || '',
    event_when: params.eventWhen || '',
    event_location: params.eventLocation || '',
    event_url: '',
    event_calendar_url: '',
    // Per-attendee, so only the event mailer fills these in (see
    // event-registration-email.ts); everything else renders them empty.
    ticket_url: '',
    ticket_qr_url: '',
  }

  if (params.siteId) {
    const [site] = await db
      .select({
        id: sites.id,
        name: sites.name,
        subdomain: sites.subdomain,
        customDomain: sites.customDomain,
      })
      .from(sites)
      .where(eq(sites.id, params.siteId))
      .limit(1)

    if (site) {
      tokens.site_name = site.name
      tokens.site_url = getSiteUrl({
        subdomain: site.subdomain,
        customDomain: site.customDomain,
      })
      // Owners renew from the default account page, which hosts the claimed-listings block.
      tokens.renewal_url = `${tokens.site_url}/account`
      if (!tokens.app_name) tokens.app_name = site.name
      if (params.productSlug) {
        tokens.product_url = `${tokens.site_url}/products/${params.productSlug}`
      }
      if (params.eventSlug) {
        tokens.event_url = `${tokens.site_url}/events/${params.eventSlug}`
        tokens.event_calendar_url = `${tokens.event_url}/calendar.ics`
      }
    }
  }

  if (params.productId && (!tokens.product_name || !params.productSlug)) {
    const [product] = await db
      .select({
        title: products.title,
        slug: products.slug,
      })
      .from(products)
      .where(eq(products.id, params.productId))
      .limit(1)

    if (product) {
      if (!tokens.product_name) tokens.product_name = product.title
      if (!params.productSlug && tokens.site_url) {
        tokens.product_url = `${tokens.site_url}/products/${product.slug}`
      }
    }
  }

  return tokens
}
