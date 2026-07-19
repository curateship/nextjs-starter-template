/**
 * Purges the CDN/proxy sitting in front of the app. Returns whether a purge was
 * actually attempted, so callers can report honestly instead of claiming
 * success when no purge method is configured.
 */
export async function purgeProxyCache(urls?: string[]): Promise<boolean> {
  const method = process.env.CACHE_PURGE_METHOD

  if (!method || method === 'none') return false

  if (method === 'nginx') {
    const baseUrl = process.env.CACHE_PURGE_NGINX_URL || 'http://127.0.0.1'
    const purgeUrls = urls || ['/']
    await Promise.allSettled(
      purgeUrls.map(url =>
        fetch(`${baseUrl}${url}`, { method: 'PURGE' }).catch(() => {})
      )
    )
    return true
  }

  if (method === 'cloudflare') {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID
    const apiToken = process.env.CLOUDFLARE_API_TOKEN
    if (!zoneId || !apiToken) return false

    const body = urls
      ? { files: urls }
      : { purge_everything: true }

    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    ).catch(() => {})
    return true
  }

  return false
}
