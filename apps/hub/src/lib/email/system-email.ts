import { and, eq, sql } from 'drizzle-orm'
import { generateEmailHtml } from '@/lib/actions/newsletters/render'
import { db } from '@/lib/db'
import { emailSystemTemplates, products, sites } from '@/lib/db/schema'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

export type SystemEmailTemplateKey =
  | 'password_reset'
  | 'lead_magnet_delivery'
  | 'paid_purchase_delivery'

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

export const SYSTEM_EMAIL_TEMPLATE_KEYS: SystemEmailTemplateKey[] = [
  'password_reset',
  'lead_magnet_delivery',
  'paid_purchase_delivery',
]

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

  if (templateKey === 'lead_magnet_delivery') {
    return {
      name: 'Lead Magnet Delivery',
      description: 'Sent after someone signs up for a lead magnet.',
      scopeLabel: 'Current Site',
      subject: 'Your {{product_name}} is ready',
      bodyHtml: '<p>Your {{product_name}} is ready.</p><p><a href="{{product_url}}">Open {{product_name}}</a></p>',
      tokens: ['{{product_name}}', '{{site_name}}', '{{site_url}}', '{{product_url}}'],
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
  return templateKey === 'password_reset' ? GLOBAL_SCOPE_KEY : (siteId || '')
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
    site_id: templateKey === 'password_reset' ? null : (siteId ?? null),
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
  const [row] = await db
    .select()
    .from(emailSystemTemplates)
    .where(and(
      eq(emailSystemTemplates.templateKey, templateKey),
      eq(emailSystemTemplates.scopeKey, scopeKey),
    ))
    .limit(1)

  return row ? rowToSystemEmailTemplate(row) : null
}

export async function getSystemEmailTemplate(templateKey: SystemEmailTemplateKey, siteId?: string | null) {
  return await getStoredTemplate(templateKey, siteId) || buildDefaultTemplateRecord(templateKey, siteId)
}

export async function getSystemEmailList(siteId: string, canEditAuth: boolean) {
  const [passwordReset, leadMagnet, paidPurchase] = await Promise.all([
    getSystemEmailTemplate('password_reset'),
    getSystemEmailTemplate('lead_magnet_delivery', siteId),
    getSystemEmailTemplate('paid_purchase_delivery', siteId),
  ])

  return [passwordReset, leadMagnet, paidPurchase].map((template) => {
    const definition = getDefaultTemplateDefinition(template.template_key)
    return {
      ...template,
      name: definition.name,
      description: definition.description,
      scope_label: definition.scopeLabel,
      editable: template.template_key === 'password_reset' ? canEditAuth : true,
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

function getSortedNewsletterBlocks(contentBlocks: Record<string, any>) {
  return Object.values(contentBlocks || {})
    .filter((block: any) => block?.id && block?.type)
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
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
  return generateEmailHtml(getSortedNewsletterBlocks(transactionalBlocks), 600)
}

export function renderSystemEmailSubject(subject: string, tokens: Record<string, string>) {
  return interpolateString(subject, tokens)
}

export async function buildSystemEmailTokens(params: {
  templateKey: SystemEmailTemplateKey
  siteId?: string | null
  resetUrl?: string | null
  productId?: string | null
  productName?: string | null
  productSlug?: string | null
  tierName?: string | null
  downloadPageContent?: string | null
}) {
  const tokens: Record<string, string> = {
    app_name: 'System Everything',
    reset_url: params.resetUrl || '',
    site_name: '',
    site_url: '',
    product_name: params.productName || '',
    product_url: '',
    tier_name: params.tierName || '',
    download_page_content: params.downloadPageContent || '',
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
      if (!tokens.app_name) tokens.app_name = site.name
      if (params.productSlug) {
        tokens.product_url = `${tokens.site_url}/products/${params.productSlug}`
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
