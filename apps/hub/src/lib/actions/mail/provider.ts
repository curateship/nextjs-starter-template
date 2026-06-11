import 'server-only'
import dns from 'node:dns/promises'

export type MailProviderId = 'mxroute'

type DnsRecordStatus = 'pass' | 'missing'

export interface MailDnsRecord {
  type: 'MX' | 'TXT' | 'CNAME'
  name: string
  value: string
  priority?: number
  description?: string
  status?: DnsRecordStatus
}

export interface ProviderMailbox {
  email: string
  localPart: string
  quotaMb: number
  usageMb: number
  dailySendLimit: number
  sentToday: number
  suspended: boolean
  providerData?: Record<string, unknown>
}

interface CreateProviderMailboxInput {
  localPart: string
  password: string
  quotaMb: number
  dailySendLimit?: number
}

export interface MailProviderAdapter {
  getDnsRecords(domain: string): Promise<MailDnsRecord[]>
  checkDomain(domain: string): Promise<MailDnsRecord[]>
  listMailboxes(domain: string): Promise<ProviderMailbox[]>
  createMailbox(domain: string, input: CreateProviderMailboxInput): Promise<ProviderMailbox>
  disableMailbox(email: string): Promise<{ supported: boolean; message: string }>
  sendTestEmail(email: string): Promise<{ supported: boolean; message: string }>
}

interface MxrouteConfig {
  server: string
  username: string
  apiKey: string
}

class MailProviderError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

function recordHost(domain: string, name: string) {
  const cleanName = normalizeHost(name)
  const cleanDomain = normalizeHost(domain)
  if (cleanName === '@' || cleanName === cleanDomain) return cleanDomain
  if (cleanName.endsWith(`.${cleanDomain}`)) return cleanName
  return `${cleanName}.${cleanDomain}`
}

async function checkRecord(domain: string, record: MailDnsRecord): Promise<DnsRecordStatus> {
  try {
    if (record.type === 'MX') {
      const records = await dns.resolveMx(domain)
      const expected = normalizeHost(record.value)
      return records.some((mx) => normalizeHost(mx.exchange) === expected && (!record.priority || mx.priority === record.priority))
        ? 'pass'
        : 'missing'
    }

    if (record.type === 'TXT') {
      const records = await dns.resolveTxt(recordHost(domain, record.name))
      const expected = record.value.trim()
      return records.some((txt) => txt.join('').trim() === expected) ? 'pass' : 'missing'
    }

    if (record.type === 'CNAME') {
      const records = await dns.resolveCname(recordHost(domain, record.name))
      const expected = normalizeHost(record.value)
      return records.some((cname) => normalizeHost(cname) === expected) ? 'pass' : 'missing'
    }
  } catch {
    return 'missing'
  }

  return 'missing'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function mapMxrouteDns(domain: string, data: Record<string, unknown>): MailDnsRecord[] {
  const records: MailDnsRecord[] = []
  const mxRecords = Array.isArray(data.mx_records) ? data.mx_records : []

  for (const mxRecord of mxRecords) {
    if (!isRecord(mxRecord)) continue
    const hostname = readString(mxRecord.hostname)
    if (!hostname) continue
    records.push({
      type: 'MX',
      name: '@',
      value: hostname,
      priority: readNumber(mxRecord.priority, 10),
      description: readString(mxRecord.description) || 'MXroute mail exchange',
    })
  }

  for (const key of ['spf', 'dkim', 'verification']) {
    const record = data[key]
    if (!isRecord(record)) continue
    const type = readString(record.type).toUpperCase()
    const name = readString(record.name)
    const value = readString(record.value)
    if ((type !== 'TXT' && type !== 'CNAME') || !name || !value) continue

    records.push({
      type: type as 'TXT' | 'CNAME',
      name,
      value,
      description: readString(record.description) || `${key.toUpperCase()} record for ${domain}`,
    })
  }

  return records
}

function mapMxrouteMailbox(domain: string, value: Record<string, unknown>): ProviderMailbox {
  const email = readString(value.email)
  const username = readString(value.username)
  const localPart = email.split('@')[0] || username

  return {
    email: email || `${localPart}@${domain}`,
    localPart,
    quotaMb: readNumber(value.quota, 0),
    usageMb: Math.round(readNumber(value.usage, 0)),
    dailySendLimit: readNumber(value.limit, 0),
    sentToday: readNumber(value.sent, 0),
    suspended: Boolean(value.suspended),
    providerData: value,
  }
}

class MxrouteProvider implements MailProviderAdapter {
  private config: MxrouteConfig

  constructor(config: MxrouteConfig) {
    this.config = config
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://api.mxroute.com${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Server': this.config.server,
        'X-Username': this.config.username,
        'X-API-Key': this.config.apiKey,
        ...init?.headers,
      },
      cache: 'no-store',
    })

    if (response.status === 204) return {} as T

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = isRecord(payload?.error) && typeof payload.error.message === 'string'
        ? payload.error.message
        : 'MXroute request failed'
      throw new MailProviderError(message, response.status)
    }

    return payload as T
  }

  async getDnsRecords(domain: string): Promise<MailDnsRecord[]> {
    try {
      const response = await this.request<{ data?: Record<string, unknown> }>(`/domains/${encodeURIComponent(domain)}/dns`)
      return response.data ? mapMxrouteDns(domain, response.data) : []
    } catch (error) {
      if (!(error instanceof MailProviderError) || error.status !== 404) throw error

      const response = await this.request<{ data?: { record?: { type?: string; name?: string; value?: string } } }>('/verification-key')
      const record = response.data?.record
      if (!record?.name || !record.value) return []
      return [{
        type: 'TXT',
        name: record.name,
        value: record.value,
        description: 'MXroute domain verification',
      }]
    }
  }

  async checkDomain(domain: string): Promise<MailDnsRecord[]> {
    const records = await this.getDnsRecords(domain)
    return Promise.all(records.map(async (record) => ({
      ...record,
      status: await checkRecord(domain, record),
    })))
  }

  async listMailboxes(domain: string): Promise<ProviderMailbox[]> {
    const response = await this.request<{ data?: Record<string, unknown>[] }>(`/domains/${encodeURIComponent(domain)}/email-accounts`)
    return (response.data ?? []).filter(isRecord).map((mailbox) => mapMxrouteMailbox(domain, mailbox))
  }

  async createMailbox(domain: string, input: CreateProviderMailboxInput): Promise<ProviderMailbox> {
    await this.request(`/domains/${encodeURIComponent(domain)}/email-accounts`, {
      method: 'POST',
      body: JSON.stringify({
        username: input.localPart,
        password: input.password,
        quota: input.quotaMb,
        limit: input.dailySendLimit ?? 9600,
      }),
    })

    const mailboxes = await this.listMailboxes(domain)
    return mailboxes.find((mailbox) => mailbox.localPart === input.localPart)
      ?? {
        email: `${input.localPart}@${domain}`,
        localPart: input.localPart,
        quotaMb: input.quotaMb,
        usageMb: 0,
        dailySendLimit: input.dailySendLimit ?? 9600,
        sentToday: 0,
        suspended: false,
      }
  }

  async createDomain(domain: string) {
    try {
      await this.request(`/domains`, {
        method: 'POST',
        body: JSON.stringify({ domain }),
      })
    } catch (error) {
      if (error instanceof MailProviderError && error.status === 409) return
      throw error
    }
  }

  async disableMailbox() {
    return {
      supported: false,
      message: 'MXroute does not expose a mailbox disable API. Hub disabled this mailbox locally.',
    }
  }

  async sendTestEmail() {
    return {
      supported: false,
      message: 'Test email sending is not enabled for MXroute in Phase 1.',
    }
  }
}

export function createMailProvider(provider: MailProviderId, config: Record<string, unknown>): MailProviderAdapter {
  if (provider === 'mxroute') {
    const server = readString(config.server)
    const username = readString(config.username)
    const apiKey = readString(config.api_key)
    if (!server || !username || !apiKey) {
      throw new Error('MXroute credentials are incomplete')
    }
    return new MxrouteProvider({ server, username, apiKey })
  }

  throw new Error('Unsupported mail provider')
}

export async function setupMxrouteDomain(config: Record<string, unknown>, domain: string) {
  const server = readString(config.server)
  const username = readString(config.username)
  const apiKey = readString(config.api_key)
  if (!server || !username || !apiKey) {
    throw new Error('MXroute credentials are incomplete')
  }

  await new MxrouteProvider({ server, username, apiKey }).createDomain(domain)
}
