import { boundedString } from '../parse-utils'
import { defineNode } from '../node-descriptor'

export const scraperNode = defineNode({
  kind: 'scraper',
  meta: { name: 'Scraper', description: 'Read public web pages.', group: 'Sources' },
  inputs: 'multi',
  createConfig: () => ({ urls: [''] }),
  ports: () => [{ id: 'documents', label: 'Pages' }],
  parseConfig: (config) => {
    if (!Array.isArray(config.urls) || config.urls.length > 20) throw new Error('Scraper URLs are invalid')
    return { urls: config.urls.map((url) => boundedString(url, 'Scraper URL', 2048)) }
  },
  validate: (node, push) => {
    const urls = node.config.urls.map((url) => url.trim()).filter(Boolean)
    if (urls.length === 0) push('scraper-url', 'Add at least one website URL.')
    if (new Set(urls).size !== urls.length) push('scraper-duplicate-url', 'Remove duplicate website URLs.')
    for (const url of urls) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) throw new Error()
      } catch {
        push('scraper-url', 'Scraper URLs must be public HTTPS addresses.')
        break
      }
    }
  },
  allowedTargets: (port) => (port === 'documents' ? ['router', 'agent', 'listing'] : []),
})
