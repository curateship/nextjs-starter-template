import { AI_PROVIDER_DEFAULT_MODELS, isAIProvider } from '@/lib/utils/ai-models'
import { boundedString, isRecord, requiredString } from '../parse-utils'
import { defineNode } from '../node-descriptor'
import type { AutomationRouterRoute } from '../types'

export const routerNode = defineNode({
  kind: 'router',
  meta: { name: 'AI Router', description: 'Group pages by content type.', group: 'AI' },
  inputs: 'multi',
  providerRequirement: 'required',
  createConfig: () => ({
    provider: 'openai',
    model: AI_PROVIDER_DEFAULT_MODELS.openai,
    routes: [
      { id: crypto.randomUUID(), name: 'News', description: 'News and current events.' },
      { id: crypto.randomUUID(), name: 'Guides', description: 'Tutorials and educational content.' },
    ],
  }),
  ports: (node) => [
    ...node.config.routes.map((route) => ({ id: `route:${route.id}` as const, label: route.name })),
    { id: 'else' as const, label: 'Else' },
  ],
  parseConfig: (config) => {
    if (!isAIProvider(config.provider) || !Array.isArray(config.routes) || config.routes.length > 8) {
      throw new Error('AI Router configuration is invalid')
    }
    return {
      provider: config.provider,
      model: boundedString(config.model, 'AI Router model', 120),
      routes: config.routes.map(parseRoute),
    }
  },
  validate: (node, push) => {
    if (!node.config.model.trim()) push('router-model', 'Choose an AI Router model.')
    if (node.config.routes.length === 0) push('router-routes', 'Add at least one AI Router route.')
    const names = node.config.routes.map((route) => route.name.trim().toLowerCase())
    const routeIds = node.config.routes.map((route) => route.id)
    if (new Set(routeIds).size !== routeIds.length) push('router-routes', 'AI Router route IDs must be unique.')
    if (new Set(names).size !== names.length) push('router-routes', 'AI Router route names must be unique.')
    for (const route of node.config.routes) {
      if (!route.name.trim() || !route.description.trim()) push('router-route', 'Each AI Router route needs a name and description.')
    }
  },
  allowedTargets: (port) => (port === 'else' || port.startsWith('route:') ? ['agent', 'listing', 'event'] : []),
  validateConnections: (node, { outgoing }, push) => {
    for (const route of node.config.routes) {
      if (!outgoing.some((edge) => edge.sourcePort === `route:${route.id}`)) {
        push('route-output', `Connect the ${route.name} route.`)
      }
    }
    if (!outgoing.some((edge) => edge.sourcePort === 'else')) {
      push('route-output', 'Connect the Else route.')
    }
  },
})

function parseRoute(value: unknown): AutomationRouterRoute {
  if (!isRecord(value)) throw new Error('AI Router route is invalid')
  return {
    id: requiredString(value.id, 'AI Router route ID', 64),
    name: boundedString(value.name, 'AI Router route name', 80),
    description: boundedString(value.description, 'AI Router route description', 500),
  }
}
