const http = require('node:http')
const { createHash, timingSafeEqual } = require('node:crypto')
const { mkdir, rename, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

const port = Number(process.env.PORT || 3000)
const token = process.env.TRAEFIK_CONFIG_WRITER_TOKEN
const configDir = process.env.TRAEFIK_DYNAMIC_CONFIG_DIR || '/data/coolify/proxy/dynamic'
const hubService = process.env.TRAEFIK_HUB_SERVICE
const maxBodyBytes = 256 * 1024

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function isAuthorized(req) {
  if (!token) return false
  const authHeader = req.headers.authorization || ''
  const expected = Buffer.from(`Bearer ${token}`)
  const actual = Buffer.from(authHeader)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function isValidDomain(domain) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain)
}

function isValidTraefikService(service) {
  return /^[a-zA-Z0-9_.-]+(?:@[a-zA-Z0-9_.-]+)?$/.test(service)
}

function getDomainAliases(domain) {
  const aliases = [domain]
  if (domain.split('.').length === 2) aliases.push(`www.${domain}`)
  return aliases
}

function getRouteSlug(domain) {
  return createHash('sha256').update(domain).digest('hex').slice(0, 12)
}

function getTraefikConfig(domain) {
  if (!hubService || !isValidTraefikService(hubService)) return null

  const routeName = `hub-custom-domain-${getRouteSlug(domain)}`
  const hostRule = getDomainAliases(domain).map((alias) => `Host(\`${alias}\`)`).join(' || ')

  return {
    filename: `${routeName}.yml`,
    config: `http:
  routers:
    ${routeName}-http:
      entryPoints:
        - http
      rule: ${hostRule}
      middlewares:
        - ${routeName}-redirect
      service: ${hubService}

    ${routeName}-https:
      entryPoints:
        - https
      rule: ${hostRule}
      middlewares:
        - ${routeName}-gzip
      service: ${hubService}
      tls:
        certResolver: letsencrypt

  middlewares:
    ${routeName}-redirect:
      redirectScheme:
        scheme: https
    ${routeName}-gzip:
      compress: {}
`,
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', (chunk) => {
      body += chunk
      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(new Error('Body too large'))
        req.destroy()
      }
    })

    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

async function writeConfig(filename, config) {
  await mkdir(configDir, { recursive: true })
  const targetPath = join(configDir, filename)
  const tempPath = join(configDir, `${filename}.${Date.now()}.tmp`)

  await writeFile(tempPath, config, 'utf8')
  await rename(tempPath, targetPath)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method !== 'POST' || req.url !== '/configs') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  try {
    const body = await readBody(req)
    const payload = JSON.parse(body)

    if (!isValidDomain(payload.domain)) {
      sendJson(res, 400, { error: 'Invalid config payload' })
      return
    }

    const dynamicConfig = getTraefikConfig(payload.domain)
    if (!dynamicConfig) {
      sendJson(res, 500, { error: 'Traefik service is not configured' })
      return
    }

    await writeConfig(dynamicConfig.filename, dynamicConfig.config)
    sendJson(res, 200, { ok: true })
  } catch {
    sendJson(res, 500, { error: 'Failed to write config' })
  }
})

server.listen(port, () => {
  console.log(`Traefik config writer listening on ${port}`)
})
