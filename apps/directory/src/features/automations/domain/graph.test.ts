import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAutomationGraph, validateAutomationGraph } from './graph'
import type { AutomationGraph } from './types'

const ids = {
  time: '11111111-1111-4111-8111-111111111111',
  scraper: '22222222-2222-4222-8222-222222222222',
  router: '33333333-3333-4333-8333-333333333333',
  newsAgent: '44444444-4444-4444-8444-444444444444',
  elseAgent: '55555555-5555-4555-8555-555555555555',
  newsPost: '66666666-6666-4666-8666-666666666666',
  elsePost: '77777777-7777-4777-8777-777777777777',
  route: '88888888-8888-4888-8888-888888888888',
}

function validGraph(): AutomationGraph {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'daily', time: '09:00', timezone: 'UTC' } } },
      { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/news'] } },
      { id: ids.router, kind: 'router', name: 'AI Router', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', routes: [{ id: ids.route, name: 'News', description: 'Current news.' }] } },
      { id: ids.newsAgent, kind: 'agent', name: 'News Writer', x: 900, y: 0, config: { provider: 'openai', model: 'gpt-test', instructions: 'Write a news article.' } },
      { id: ids.elseAgent, kind: 'agent', name: 'General Writer', x: 900, y: 180, config: { provider: 'openai', model: 'gpt-test', instructions: 'Write a general article.' } },
      { id: ids.newsPost, kind: 'post', name: 'News Post', x: 1200, y: 0, config: { templateId: 'template-1', publish: false, categoryIds: [], primaryCategoryId: null } },
      { id: ids.elsePost, kind: 'post', name: 'General Post', x: 1200, y: 180, config: { templateId: 'template-1', publish: false, categoryIds: [], primaryCategoryId: null } },
    ],
    edges: [
      { id: 'e1', from: ids.time, sourcePort: 'then', to: ids.scraper },
      { id: 'e2', from: ids.scraper, sourcePort: 'documents', to: ids.router },
      { id: 'e3', from: ids.router, sourcePort: `route:${ids.route}`, to: ids.newsAgent },
      { id: 'e4', from: ids.router, sourcePort: 'else', to: ids.elseAgent },
      { id: 'e5', from: ids.newsAgent, sourcePort: 'article', to: ids.newsPost },
      { id: 'e6', from: ids.elseAgent, sourcePort: 'article', to: ids.elsePost },
    ],
  }
}

describe('automation graph validation', () => {
  it('accepts a scheduled scraper, router, agent, and post workflow', () => {
    assert.deepEqual(validateAutomationGraph(validGraph()), [])
  })

  it('requires all router outputs, including Else, to be connected', () => {
    const graph = validGraph()
    graph.edges = graph.edges.filter((edge) => edge.sourcePort !== 'else')
    const messages = validateAutomationGraph(graph).map((error) => error.message)
    assert.ok(messages.includes('Connect the Else route.'))
  })

  it('rejects cycles and invalid node pairings', () => {
    const graph = validGraph()
    graph.edges.push({ id: 'e7', from: ids.newsAgent, sourcePort: 'article', to: ids.scraper })
    const codes = validateAutomationGraph(graph).map((error) => error.code)
    assert.ok(codes.includes('invalid-connection'))
    assert.ok(codes.includes('cycle'))
  })

  it('accepts a scraper feeding a terminal Listing node', () => {
    const graph: AutomationGraph = {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'weekly', time: '09:00', timezone: 'UTC', dayOfWeek: 1 } } },
        { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/members'] } },
        { id: ids.newsPost, kind: 'listing', name: 'Listing', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', templateId: 'template-1', categoryId: null, instructions: '' } },
      ],
      edges: [
        { id: 'e1', from: ids.time, sourcePort: 'then', to: ids.scraper },
        { id: 'e2', from: ids.scraper, sourcePort: 'documents', to: ids.newsPost },
      ],
    }
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(graph)), [])
  })

  it('rejects a Listing node with outgoing connections and requires its template', () => {
    const graph: AutomationGraph = {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'daily', time: '09:00', timezone: 'UTC' } } },
        { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/members'] } },
        { id: ids.newsPost, kind: 'listing', name: 'Listing', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', templateId: '', categoryId: null, instructions: '' } },
        { id: ids.elsePost, kind: 'post', name: 'Post', x: 900, y: 0, config: { templateId: 'template-1', publish: false, categoryIds: [], primaryCategoryId: null } },
      ],
      edges: [
        { id: 'e1', from: ids.time, sourcePort: 'then', to: ids.scraper },
        { id: 'e2', from: ids.scraper, sourcePort: 'documents', to: ids.newsPost },
        { id: 'e3', from: ids.newsPost, sourcePort: 'article', to: ids.elsePost },
      ],
    }
    const codes = validateAutomationGraph(parseAutomationGraph(graph)).map((error) => error.code)
    assert.ok(codes.includes('post-terminal'))
    assert.ok(codes.includes('listing-template'))
  })

  it('parses structurally valid incomplete drafts so they can be saved', () => {
    const graph = validGraph()
    const agent = graph.nodes.find((node) => node.id === ids.newsAgent)
    if (!agent || agent.kind !== 'agent') assert.fail('Missing agent fixture')
    agent.name = ''
    agent.config.model = ''
    agent.config.instructions = ''
    const parsed = parseAutomationGraph(graph)
    const codes = validateAutomationGraph(parsed).filter((error) => error.nodeId === agent.id).map((error) => error.code)
    assert.ok(codes.includes('node-name'))
    assert.ok(codes.includes('agent-model'))
    assert.ok(codes.includes('agent-prompt'))
  })
})
