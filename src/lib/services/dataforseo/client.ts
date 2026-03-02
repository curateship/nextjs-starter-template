import { getDataForSEOConfig } from '@/lib/actions/integrations/config-helpers'

const DATAFORSEO_BASE_URL = 'https://api.dataforseo.com'

export class DataForSEOClient {
  private authHeader: string

  constructor(login: string, password: string) {
    this.authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
  }

  async post<T>(endpoint: string, body: unknown[]): Promise<T> {
    const response = await fetch(`${DATAFORSEO_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`DataForSEO API error (${response.status}): ${text}`)
    }

    return response.json()
  }
}

/**
 * Create a DataForSEO client for a specific site.
 * Reads from DB integration config first, falls back to env vars.
 */
export async function createDataForSEOClient(siteId: string): Promise<DataForSEOClient> {
  const config = await getDataForSEOConfig(siteId)

  if (!config) {
    throw new Error('DataForSEO credentials not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD env vars or configure in site integrations.')
  }

  return new DataForSEOClient(config.login, config.password)
}
