export async function purgeProxyCache(urls?: string[]) {
  const method = process.env.CACHE_PURGE_METHOD

  if (!method || method === 'none') return

  if (method === 'nginx') {
    const baseUrl = process.env.CACHE_PURGE_NGINX_URL || 'http://127.0.0.1'
    const purgeUrls = urls || ['/']
    await Promise.allSettled(
      purgeUrls.map(url =>
        fetch(`${baseUrl}${url}`, { method: 'PURGE' }).catch(() => {})
      )
    )
  }

  if (method === 'cloudflare') {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID
    const apiToken = process.env.CLOUDFLARE_API_TOKEN
    if (!zoneId || !apiToken) return

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
  }
}
