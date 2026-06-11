import 'server-only'

type CloudflareRecordType = 'A' | 'CNAME'

type CloudflareZone = {
  id: string
  name: string
}

type CloudflareDnsRecord = {
  id: string
  type: string
  name: string
  content: string
  proxied?: boolean
}

type CloudflareResponse<T> = {
  success: boolean
  result: T
  errors?: { message?: string }[]
}

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

function getToken() {
  return process.env.CLOUDFLARE_DNS_API_TOKEN?.trim() || null
}

function getTarget() {
  return process.env.CLOUDFLARE_DNS_TARGET?.trim() || null
}

function getRecordType(): CloudflareRecordType {
  return process.env.CLOUDFLARE_DNS_RECORD_TYPE?.trim().toUpperCase() === 'CNAME' ? 'CNAME' : 'A'
}

function shouldProxyRecords() {
  return process.env.CLOUDFLARE_DNS_PROXIED?.trim().toLowerCase() !== 'false'
}

function getConfiguredZones() {
  const zoneMap = process.env.CLOUDFLARE_DNS_ZONES?.trim()
  if (!zoneMap) return []

  return zoneMap
    .split(',')
    .map((entry) => {
      const [name, id] = entry.split(':').map((part) => part.trim().toLowerCase())
      return name && id ? { name, id } : null
    })
    .filter((zone): zone is CloudflareZone => !!zone)
    .sort((a, b) => b.name.length - a.name.length)
}

function getDomainCandidates(domain: string) {
  const labels = domain.split('.')
  const candidates: string[] = []

  for (let i = 0; i < labels.length - 1; i++) {
    candidates.push(labels.slice(i).join('.'))
  }

  return candidates
}

async function cloudflareRequest<T>(path: string, init: RequestInit = {}) {
  const token = getToken()
  if (!token) throw new Error('Cloudflare DNS is not configured')

  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  const data = await response.json() as CloudflareResponse<T>

  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message || `Cloudflare returned ${response.status}`)
  }

  return data.result
}

async function findZone(domain: string) {
  const configuredZone = getConfiguredZones().find(
    (zone) => domain === zone.name || domain.endsWith(`.${zone.name}`)
  )
  if (configuredZone) return configuredZone

  for (const candidate of getDomainCandidates(domain)) {
    const zones = await cloudflareRequest<CloudflareZone[]>(
      `/zones?name=${encodeURIComponent(candidate)}&status=active&per_page=1`
    )
    const zone = zones[0]
    if (zone) return zone
  }

  return null
}

async function listRecords(zoneId: string, name: string, type?: string) {
  const params = new URLSearchParams({ name, per_page: '20' })
  if (type) params.set('type', type)

  return cloudflareRequest<CloudflareDnsRecord[]>(
    `/zones/${encodeURIComponent(zoneId)}/dns_records?${params.toString()}`
  )
}

async function upsertAddressRecord(zoneId: string, name: string, type: CloudflareRecordType, content: string) {
  const existing = await listRecords(zoneId, name)
  const conflicting = existing.find((record) => ['A', 'CNAME'].includes(record.type) && record.type !== type)
  if (conflicting) {
    throw new Error(`${name} already has a ${conflicting.type} record in Cloudflare`)
  }

  const current = existing.find((record) => record.type === type)
  const body = {
    type,
    name,
    content,
    ttl: 1,
    proxied: shouldProxyRecords(),
  }

  if (current) {
    await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return
  }

  await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

async function ensureTxtRecord(zoneId: string, name: string, content: string) {
  const existing = await listRecords(zoneId, name, 'TXT')
  if (existing.some((record) => record.content === content)) return

  await cloudflareRequest(`/zones/${encodeURIComponent(zoneId)}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'TXT',
      name,
      content,
      ttl: 1,
    }),
  })
}

function isCloudflareDnsConfigured() {
  return !!getToken()
}

export async function ensureCloudflareCustomDomainDns({
  domain,
  aliases,
  verificationName,
  verificationValue,
}: {
  domain: string
  aliases: string[]
  verificationName: string
  verificationValue: string
}): Promise<string | null> {
  if (!isCloudflareDnsConfigured()) return null

  const target = getTarget()
  if (!target) return 'Cloudflare DNS target is not configured'

  try {
    const zone = await findZone(domain)
    if (!zone) return null

    const type = getRecordType()
    for (const alias of aliases) {
      await upsertAddressRecord(zone.id, alias, type, target)
    }
    await ensureTxtRecord(zone.id, verificationName, verificationValue)
  } catch {
    return 'Failed to create Cloudflare DNS records'
  }

  return null
}
