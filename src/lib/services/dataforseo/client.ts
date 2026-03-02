const DATAFORSEO_BASE_URL = 'https://api.dataforseo.com'

export class DataForSEOClient {
  private authHeader: string

  constructor() {
    const login = process.env.DATAFORSEO_LOGIN
    const password = process.env.DATAFORSEO_PASSWORD

    if (!login || !password) {
      throw new Error('DataForSEO credentials not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD env vars.')
    }

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
