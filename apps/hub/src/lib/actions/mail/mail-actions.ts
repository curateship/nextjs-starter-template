'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { mailDomains, mailboxes, sites } from '@/lib/db/schema'
import { createOrUpdateIntegration } from '@/lib/actions/integrations/integration-actions'
import { getMxrouteConfig } from '@/lib/actions/integrations/config-helpers'
import { createMailProvider, setupMxrouteDomain, type MailDnsRecord, type ProviderMailbox } from './provider'
import { encrypt } from '@/lib/utils/encryption'
import { requireAdmin } from '@/lib/db/helpers'
import { actionFailure, actionSuccess, type AdminActionResult } from '@/lib/actions/action-result'

const LOCAL_PART_REGEX = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i

export interface MailDashboardData {
  siteId: string
  customDomain: string | null
  provider: 'mxroute'
  providerConfigured: boolean
  webmailUrl: string
  mailDomain: {
    id: string
    domain: string
    status: string
    dnsRecords: MailDnsRecord[]
  } | null
  mailboxes: MailboxListItem[]
}

export interface MailboxListItem {
  id: string
  email: string
  localPart: string
  status: string
  quotaMb: number
  usageMb: number
  dailySendLimit: number
  sentToday: number
  provider: string
  providerSuspended: boolean
  updatedAt: string
}

interface SaveMxrouteInput {
  siteId: string
  server: string
  username: string
  apiKey: string
  webmailUrl?: string
}

interface CreateMailboxInput {
  siteId: string
  localPart: string
  password: string
  quotaMb: number
}

function normalizeDomain(value: string | null) {
  return value?.trim().toLowerCase() || null
}

function normalizeLocalPart(value: string) {
  return value.trim().toLowerCase()
}

function getWebmailUrl(config?: Record<string, any> | null) {
  const configured = typeof config?.webmail_url === 'string' ? config.webmail_url.trim() : ''
  return normalizeWebmailUrl(configured)
}

function normalizeWebmailUrl(value?: string) {
  if (!value) return 'https://webmail.mxroute.com'

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : 'https://webmail.mxroute.com'
  } catch {
    return 'https://webmail.mxroute.com'
  }
}

function providerConfigured(config?: Record<string, any> | null) {
  return Boolean(config?.server && config?.username && config?.api_key)
}

function isValidHostname(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value)
}

function assertPassword(password: string) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password needs uppercase, lowercase, and number characters.'
  }
  return null
}

async function getOwnedSite(siteId: string) {
  const user = await requireAdmin()

  return db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true, customDomain: true },
  })
}

async function ensureMailDomain(siteId: string, domain: string) {
  const existing = await db.query.mailDomains.findFirst({
    where: eq(mailDomains.siteId, siteId),
  })

  if (existing?.domain === domain && existing.provider === 'mxroute') {
    return existing
  }

  if (existing) {
    const [updated] = await db
      .update(mailDomains)
      .set({ domain, provider: 'mxroute', updatedAt: new Date() })
      .where(eq(mailDomains.id, existing.id))
      .returning()

    return updated ?? existing
  }

  const [row] = await db
    .insert(mailDomains)
    .values({
      siteId,
      domain,
      provider: 'mxroute',
      updatedAt: new Date(),
    })
    .returning()

  return row
}

function mergeMailboxes(localRows: Array<typeof mailboxes.$inferSelect>, providerRows: ProviderMailbox[]): MailboxListItem[] {
  const providerByEmail = new Map(providerRows.map((mailbox) => [mailbox.email.toLowerCase(), mailbox]))
  const localEmails = new Set(localRows.map((mailbox) => mailbox.email.toLowerCase()))

  const localItems = localRows.map((mailbox) => {
    const providerMailbox = providerByEmail.get(mailbox.email.toLowerCase())
    return {
      id: mailbox.id,
      email: mailbox.email,
      localPart: mailbox.localPart,
      status: mailbox.status,
      quotaMb: providerMailbox?.quotaMb ?? mailbox.quotaMb,
      usageMb: providerMailbox?.usageMb ?? mailbox.usageMb,
      dailySendLimit: providerMailbox?.dailySendLimit ?? mailbox.dailySendLimit,
      sentToday: providerMailbox?.sentToday ?? mailbox.sentToday,
      provider: mailbox.provider,
      providerSuspended: providerMailbox?.suspended ?? mailbox.providerSuspended,
      updatedAt: mailbox.updatedAt.toISOString(),
    }
  })

  const providerOnlyItems = providerRows
    .filter((mailbox) => !localEmails.has(mailbox.email.toLowerCase()))
    .map((mailbox) => ({
      id: `provider:${mailbox.email}`,
      email: mailbox.email,
      localPart: mailbox.localPart,
      status: mailbox.suspended ? 'provider_suspended' : 'provider_only',
      quotaMb: mailbox.quotaMb,
      usageMb: mailbox.usageMb,
      dailySendLimit: mailbox.dailySendLimit,
      sentToday: mailbox.sentToday,
      provider: 'mxroute',
      providerSuspended: mailbox.suspended,
      updatedAt: new Date().toISOString(),
    }))

  return [...localItems, ...providerOnlyItems]
}

export async function getMailDashboardAction(siteId: string): Promise<{ data: MailDashboardData | null; error: string | null }> {
  try {
    const site = await getOwnedSite(siteId)
    if (!site) return { data: null, error: 'Site not found' }

    const customDomain = normalizeDomain(site.customDomain)
    const mxrouteConfig = await getMxrouteConfig(siteId)
    const configured = providerConfigured(mxrouteConfig)
    let mailDomain = customDomain ? await ensureMailDomain(siteId, customDomain) : null
    let dnsRecords: MailDnsRecord[] = []
    let providerRows: ProviderMailbox[] = []

    if (customDomain && configured && mailDomain) {
      const provider = createMailProvider('mxroute', mxrouteConfig!)
      dnsRecords = await provider.checkDomain(customDomain)
      providerRows = await provider.listMailboxes(customDomain).catch(() => [])
      const status = dnsRecords.length > 0 && dnsRecords.every((record) => record.status === 'pass') ? 'ready' : 'dns_pending'

      const [updated] = await db
        .update(mailDomains)
        .set({ status, dnsStatus: { records: dnsRecords }, updatedAt: new Date() })
        .where(eq(mailDomains.id, mailDomain.id))
        .returning()
      mailDomain = updated ?? mailDomain
    }

    const localRows = mailDomain
      ? await db
          .select()
          .from(mailboxes)
          .where(eq(mailboxes.mailDomainId, mailDomain.id))
      : []

    return {
      data: {
        siteId,
        customDomain,
        provider: 'mxroute',
        providerConfigured: configured,
        webmailUrl: getWebmailUrl(mxrouteConfig),
        mailDomain: mailDomain
          ? {
              id: mailDomain.id,
              domain: mailDomain.domain,
              status: mailDomain.status,
              dnsRecords,
            }
          : null,
        mailboxes: mergeMailboxes(localRows, providerRows),
      },
      error: null,
    }
  } catch (error) {
    console.error('getMailDashboardAction error:', error instanceof Error ? error.message : String(error))
    return { data: null, error: 'Failed to load mail settings' }
  }
}

export async function saveMxrouteIntegrationAction(input: SaveMxrouteInput): Promise<AdminActionResult> {
  try {
    const site = await getOwnedSite(input.siteId)
    if (!site) return actionFailure('Site not found')

    const server = input.server.trim().toLowerCase()
    const username = input.username.trim()
    const apiKey = input.apiKey.trim()
    if (!server || !username || !apiKey) return actionFailure('MXroute server, username, and API key are required.')
    if (!isValidHostname(server)) return actionFailure('Enter a valid MXroute server hostname.')

    await createOrUpdateIntegration(input.siteId, 'mxroute', {
      server,
      username,
      api_key: apiKey,
      webmail_url: normalizeWebmailUrl(input.webmailUrl),
    })

    revalidatePath('/admin/mail')
    return actionSuccess(undefined)
  } catch (error) {
    console.error('saveMxrouteIntegrationAction error:', error instanceof Error ? error.message : String(error))
    return actionFailure('Something went wrong saving MXroute settings — the error has been logged.')
  }
}

export async function createMailboxAction(input: CreateMailboxInput): Promise<AdminActionResult> {
  try {
    const site = await getOwnedSite(input.siteId)
    if (!site) return actionFailure('Site not found')

    const domain = normalizeDomain(site.customDomain)
    if (!domain) return actionFailure('Add and verify a custom domain before creating mailboxes.')

    const localPart = normalizeLocalPart(input.localPart)
    if (!LOCAL_PART_REGEX.test(localPart)) return actionFailure('Use a valid mailbox name before the @.')

    const passwordError = assertPassword(input.password)
    if (passwordError) return actionFailure(passwordError)

    const quotaMb = Number.isFinite(input.quotaMb) ? Math.max(0, Math.min(Math.round(input.quotaMb), 102400)) : 1024
    const mxrouteConfig = await getMxrouteConfig(input.siteId)
    if (!providerConfigured(mxrouteConfig)) return actionFailure('Connect MXroute before creating mailboxes.')

    const mailDomain = await ensureMailDomain(input.siteId, domain)
    const provider = createMailProvider('mxroute', mxrouteConfig!)
    const created = await provider.createMailbox(domain, { localPart, password: input.password, quotaMb })

    await db
      .insert(mailboxes)
      .values({
        siteId: input.siteId,
        mailDomainId: mailDomain.id,
        localPart,
        email: `${localPart}@${domain}`,
        provider: 'mxroute',
        status: 'active',
        quotaMb: created.quotaMb || quotaMb,
        usageMb: created.usageMb,
        dailySendLimit: created.dailySendLimit || 9600,
        sentToday: created.sentToday,
        passwordEncrypted: encrypt(input.password),
        providerSuspended: created.suspended,
        providerData: created.providerData ?? {},
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [mailboxes.siteId, mailboxes.email],
        set: {
          status: 'active',
          quotaMb: created.quotaMb || quotaMb,
          usageMb: created.usageMb,
          dailySendLimit: created.dailySendLimit || 9600,
          sentToday: created.sentToday,
          passwordEncrypted: encrypt(input.password),
          providerSuspended: created.suspended,
          providerData: created.providerData ?? {},
          disabledAt: null,
          updatedAt: new Date(),
        },
      })

    revalidatePath('/admin/mail')
    return actionSuccess(undefined)
  } catch (error) {
    console.error('createMailboxAction error:', error instanceof Error ? error.message : String(error))
    return actionFailure('Something went wrong creating the mailbox — the error has been logged.')
  }
}

export async function setupMailDomainAction(siteId: string): Promise<AdminActionResult> {
  try {
    const site = await getOwnedSite(siteId)
    if (!site) return actionFailure('Site not found')

    const domain = normalizeDomain(site.customDomain)
    if (!domain) return actionFailure('Add and verify a custom domain before setting up mail.')

    const mxrouteConfig = await getMxrouteConfig(siteId)
    if (!providerConfigured(mxrouteConfig)) return actionFailure('Connect MXroute before setting up the mail domain.')

    const mailDomain = await ensureMailDomain(siteId, domain)
    await setupMxrouteDomain(mxrouteConfig!, domain)
    await db
      .update(mailDomains)
      .set({ status: 'dns_pending', updatedAt: new Date() })
      .where(eq(mailDomains.id, mailDomain.id))

    revalidatePath('/admin/mail')
    return actionSuccess(undefined)
  } catch (error) {
    console.error('setupMailDomainAction error:', error instanceof Error ? error.message : String(error))
    return actionFailure('Something went wrong setting up the MXroute domain — the error has been logged.')
  }
}

export async function disableMailboxAction(siteId: string, mailboxId: string): Promise<AdminActionResult> {
  try {
    const site = await getOwnedSite(siteId)
    if (!site) return actionFailure('Site not found')

    const [mailbox] = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.siteId, siteId)))
      .limit(1)

    if (!mailbox) return actionFailure('Mailbox not found')

    await db
      .update(mailboxes)
      .set({ status: 'disabled', disabledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.siteId, siteId)))

    revalidatePath('/admin/mail')
    return actionSuccess(undefined)
  } catch (error) {
    console.error('disableMailboxAction error:', error instanceof Error ? error.message : String(error))
    return actionFailure('Something went wrong disabling the mailbox — the error has been logged.')
  }
}
