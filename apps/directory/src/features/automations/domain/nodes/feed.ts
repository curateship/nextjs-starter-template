import { boundedString } from '../parse-utils'
import { defineNode } from '../node-descriptor'

export const feedNode = defineNode({
  kind: 'feed',
  meta: { name: 'RSS Feed', description: 'Read new entries from RSS or Atom feeds.', group: 'Sources' },
  inputs: 'multi',
  createConfig: () => ({ urls: [''] }),
  ports: () => [{ id: 'documents', label: 'Entries' }],
  parseConfig: (config) => {
    if (!Array.isArray(config.urls) || config.urls.length > 20) throw new Error('Feed URLs are invalid')
    return { urls: config.urls.map((url) => boundedString(url, 'Feed URL', 2048)) }
  },
  validate: (node, push) => {
    const urls = node.config.urls.map((url) => url.trim()).filter(Boolean)
    if (urls.length === 0) push('feed-url', 'Add at least one feed URL.')
    if (new Set(urls).size !== urls.length) push('feed-duplicate-url', 'Remove duplicate feed URLs.')
    for (const url of urls) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) throw new Error()
      } catch {
        push('feed-url', 'Feed URLs must be public HTTPS addresses.')
        break
      }
    }
  },
  allowedTargets: (port) => (port === 'documents' ? ['router', 'agent', 'listing'] : []),
})
