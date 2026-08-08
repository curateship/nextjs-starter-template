import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { downstreamAutomationNodeIds, parseAutomationGraph, validateAutomationGraph } from './graph'
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

  it('accepts a scraper and a router route feeding a terminal Event node', () => {
    const graph: AutomationGraph = {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'daily', time: '02:00', timezone: 'UTC' } } },
        { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/calendar'] } },
        { id: ids.router, kind: 'router', name: 'AI Router', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', routes: [{ id: ids.route, name: 'Concerts', description: 'Live music.' }] } },
        { id: ids.newsPost, kind: 'event', name: 'Event', x: 900, y: 0, config: { provider: 'openai', model: 'gpt-test', templateId: 'template-1', categoryId: null, instructions: '' } },
        { id: ids.elsePost, kind: 'event', name: 'Other Events', x: 900, y: 180, config: { provider: 'openai', model: 'gpt-test', templateId: 'template-1', categoryId: null, instructions: '' } },
      ],
      edges: [
        { id: 'e1', from: ids.time, sourcePort: 'then', to: ids.scraper },
        { id: 'e2', from: ids.scraper, sourcePort: 'documents', to: ids.router },
        { id: 'e3', from: ids.router, sourcePort: `route:${ids.route}`, to: ids.newsPost },
        { id: 'e4', from: ids.router, sourcePort: 'else', to: ids.elsePost },
      ],
    }
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(graph)), [])
  })

  it('rejects an Event node with outgoing connections and requires its template', () => {
    const graph: AutomationGraph = {
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'daily', time: '02:00', timezone: 'UTC' } } },
        { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/calendar'] } },
        { id: ids.newsPost, kind: 'event', name: 'Event', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', templateId: '', categoryId: null, instructions: '' } },
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
    assert.ok(codes.includes('event-template'))
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

  it('accepts an AI Image node between the AI Agent and the Post', () => {
    const graph = imageGraph('A clean editorial header image.')
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(graph)), [])
  })

  it('requires an AI Image prompt', () => {
    const graph = imageGraph('')
    const codes = validateAutomationGraph(parseAutomationGraph(graph)).map((error) => error.code)
    assert.ok(codes.includes('image-prompt'))
  })

  it('keeps a chosen reference image and defaults it to none on older graphs', () => {
    const withReference = imageGraph('Header image.', 'https://cdn.example.com/media/logo.png')
    const parsed = parseAutomationGraph(withReference).nodes.find((node) => node.kind === 'image')
    assert.equal(parsed?.kind === 'image' ? parsed.config.referenceImage : null, 'https://cdn.example.com/media/logo.png')

    const older = imageGraph('Header image.')
    const olderImage = older.nodes.find((node) => node.id === imageId)
    if (!olderImage) assert.fail('Missing image fixture')
    delete (olderImage.config as { referenceImage?: string }).referenceImage
    const olderParsed = parseAutomationGraph(older).nodes.find((node) => node.kind === 'image')
    assert.equal(olderParsed?.kind === 'image' ? olderParsed.config.referenceImage : null, '')
  })

  it('rejects an AI Image node connected to a Listing', () => {
    const graph = imageGraph('Header image.')
    const post = graph.nodes.find((node) => node.id === ids.newsPost)
    if (!post) assert.fail('Missing post fixture')
    post.kind = 'listing'
    ;(post as { config: unknown }).config = { provider: 'openai', model: 'gpt-test', templateId: 'template-1', categoryId: null, instructions: '' }
    const codes = validateAutomationGraph(parseAutomationGraph(graph)).map((error) => error.code)
    assert.ok(codes.includes('invalid-connection'))
  })

  it('accepts an Approval gate between the AI Agent and the Post', () => {
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(approvalGraph())), [])
  })

  it('accepts an Approval gate after an AI Image node', () => {
    const graph = approvalGraph()
    graph.nodes.push({ id: imageId, kind: 'image', name: 'AI Image', x: 750, y: 0, config: { provider: 'openai', prompt: 'Header image.', size: 'landscape', referenceImage: '' } })
    graph.edges = graph.edges.filter((edge) => edge.id !== 'e3')
    graph.edges.push(
      { id: 'e3a', from: ids.newsAgent, sourcePort: 'article', to: imageId },
      { id: 'e3b', from: imageId, sourcePort: 'article', to: approvalId },
    )
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(graph)), [])
  })

  it('rejects an Approval gate wired to a Listing, which takes many inputs', () => {
    const graph = approvalGraph()
    const post = graph.nodes.find((node) => node.id === ids.newsPost)
    if (!post) assert.fail('Missing post fixture')
    post.kind = 'listing'
    ;(post as { config: unknown }).config = { provider: 'openai', model: 'gpt-test', templateId: 'template-1', categoryId: null, instructions: '' }
    const codes = validateAutomationGraph(parseAutomationGraph(graph)).map((error) => error.code)
    assert.ok(codes.includes('invalid-connection'))
  })

  it('requires an Approval gate to have exactly one input', () => {
    const graph = approvalGraph()
    graph.nodes.push({ id: ids.elseAgent, kind: 'agent', name: 'Second Writer', x: 600, y: 200, config: { provider: 'openai', model: 'gpt-test', instructions: 'Write another article.' } })
    graph.edges.push(
      { id: 'e5', from: ids.scraper, sourcePort: 'documents', to: ids.elseAgent },
      { id: 'e6', from: ids.elseAgent, sourcePort: 'article', to: approvalId },
    )
    const codes = validateAutomationGraph(parseAutomationGraph(graph)).map((error) => error.code)
    assert.ok(codes.includes('approval-input'))
  })

  it('rejects an approval expiry window outside 1 hour to 30 days', () => {
    for (const expiryHours of [0, 721, 1.5]) {
      const graph = approvalGraph(expiryHours)
      assert.throws(() => parseAutomationGraph(graph), /Approval expiry window is invalid/)
    }
  })

  it('lists every node after an Approval gate so a resume knows what is left', () => {
    const graph = parseAutomationGraph(approvalGraph())
    assert.deepEqual([...downstreamAutomationNodeIds(graph, approvalId)], [ids.newsPost])
    assert.ok(!downstreamAutomationNodeIds(graph, approvalId).has(approvalId))
  })

  it('accepts a Newsletter node in place of the Post', () => {
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(newsletterGraph())), [])
  })

  it('accepts a Newsletter node after an Approval gate and an AI Image', () => {
    const graph = newsletterGraph()
    graph.nodes.push(
      { id: imageId, kind: 'image', name: 'AI Image', x: 750, y: 0, config: { provider: 'openai', prompt: 'Header image.', size: 'landscape', referenceImage: '' } },
      { id: approvalId, kind: 'approval', name: 'Approval', x: 900, y: 0, config: { expiryHours: 48 } },
    )
    graph.edges = graph.edges.filter((edge) => edge.id !== 'e3')
    graph.edges.push(
      { id: 'e3a', from: ids.newsAgent, sourcePort: 'article', to: imageId },
      { id: 'e3b', from: imageId, sourcePort: 'article', to: approvalId },
      { id: 'e3c', from: approvalId, sourcePort: 'approved', to: newsletterId },
    )
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(graph)), [])
  })

  it('rejects a Newsletter node with outgoing connections', () => {
    const graph = newsletterGraph()
    graph.nodes.push({ id: ids.elsePost, kind: 'post', name: 'Post', x: 1200, y: 0, config: { templateId: 'template-1', publish: false, categoryIds: [], primaryCategoryId: null } })
    graph.edges.push({ id: 'e4', from: newsletterId, sourcePort: 'article', to: ids.elsePost })
    const codes = validateAutomationGraph(parseAutomationGraph(graph)).map((error) => error.code)
    assert.ok(codes.includes('post-terminal'))
  })

  it('rejects a Newsletter node fed straight from a Scraper, which emits pages not an article', () => {
    const graph = newsletterGraph()
    graph.edges.push({ id: 'e4', from: ids.scraper, sourcePort: 'documents', to: newsletterId })
    const codes = validateAutomationGraph(parseAutomationGraph(graph)).map((error) => error.code)
    assert.ok(codes.includes('invalid-connection'))
    assert.ok(codes.includes('newsletter-input'))
  })

  it('requires a fixed subject line only when the fixed mode is chosen', () => {
    const aiWritten = newsletterGraph({ subjectMode: 'article', subjectText: '' })
    assert.deepEqual(validateAutomationGraph(parseAutomationGraph(aiWritten)), [])

    const blankFixed = newsletterGraph({ subjectMode: 'fixed', subjectText: '  ' })
    const codes = validateAutomationGraph(parseAutomationGraph(blankFixed)).map((error) => error.code)
    assert.ok(codes.includes('newsletter-subject'))
  })

  it('reads an unknown or missing subject mode on a stored graph as AI-written', () => {
    const graph = newsletterGraph()
    const node = graph.nodes.find((item) => item.id === newsletterId)
    if (!node) assert.fail('Missing newsletter fixture')
    ;(node as { config: Record<string, unknown> }).config = { templateId: null }
    const parsed = parseAutomationGraph(graph).nodes.find((item) => item.kind === 'newsletter')
    assert.equal(parsed?.kind === 'newsletter' ? parsed.config.subjectMode : null, 'article')
    assert.equal(parsed?.kind === 'newsletter' ? parsed.config.subjectText : null, '')
  })

  it('treats an empty template id on a stored graph as Blank', () => {
    const graph = newsletterGraph()
    const node = graph.nodes.find((item) => item.id === newsletterId)
    if (!node) assert.fail('Missing newsletter fixture')
    ;(node as { config: Record<string, unknown> }).config = { templateId: '', subjectMode: 'article', subjectText: '' }
    const parsed = parseAutomationGraph(graph).nodes.find((item) => item.kind === 'newsletter')
    assert.equal(parsed?.kind === 'newsletter' ? parsed.config.templateId : 'unset', null)
  })
})

const imageId = '99999999-9999-4999-8999-999999999999'
const approvalId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const newsletterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function newsletterGraph(
  config: { subjectMode: 'article' | 'fixed'; subjectText: string } = { subjectMode: 'article', subjectText: '' }
): AutomationGraph {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'weekly', time: '07:00', timezone: 'UTC', dayOfWeek: 1 } } },
      { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/news'] } },
      { id: ids.newsAgent, kind: 'agent', name: 'Roundup Writer', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', instructions: 'Write a weekly roundup.' } },
      { id: newsletterId, kind: 'newsletter', name: 'Newsletter', x: 900, y: 0, config: { templateId: null, ...config } },
    ],
    edges: [
      { id: 'e1', from: ids.time, sourcePort: 'then', to: ids.scraper },
      { id: 'e2', from: ids.scraper, sourcePort: 'documents', to: ids.newsAgent },
      { id: 'e3', from: ids.newsAgent, sourcePort: 'article', to: newsletterId },
    ],
  }
}

function approvalGraph(expiryHours = 48): AutomationGraph {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'daily', time: '09:00', timezone: 'UTC' } } },
      { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/news'] } },
      { id: ids.newsAgent, kind: 'agent', name: 'Writer', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', instructions: 'Write an article.' } },
      { id: approvalId, kind: 'approval', name: 'Approval', x: 900, y: 0, config: { expiryHours } },
      { id: ids.newsPost, kind: 'post', name: 'Post', x: 1200, y: 0, config: { templateId: 'template-1', publish: false, categoryIds: [], primaryCategoryId: null } },
    ],
    edges: [
      { id: 'e1', from: ids.time, sourcePort: 'then', to: ids.scraper },
      { id: 'e2', from: ids.scraper, sourcePort: 'documents', to: ids.newsAgent },
      { id: 'e3', from: ids.newsAgent, sourcePort: 'article', to: approvalId },
      { id: 'e4', from: approvalId, sourcePort: 'approved', to: ids.newsPost },
    ],
  }
}

function imageGraph(prompt: string, referenceImage = ''): AutomationGraph {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: ids.time, kind: 'time', name: 'Time', x: 0, y: 0, config: { schedule: { frequency: 'daily', time: '09:00', timezone: 'UTC' } } },
      { id: ids.scraper, kind: 'scraper', name: 'Scraper', x: 300, y: 0, config: { urls: ['https://example.com/news'] } },
      { id: ids.newsAgent, kind: 'agent', name: 'Writer', x: 600, y: 0, config: { provider: 'openai', model: 'gpt-test', instructions: 'Write an article.' } },
      { id: imageId, kind: 'image', name: 'AI Image', x: 900, y: 0, config: { provider: 'openai', prompt, size: 'landscape', referenceImage } },
      { id: ids.newsPost, kind: 'post', name: 'Post', x: 1200, y: 0, config: { templateId: 'template-1', publish: false, categoryIds: [], primaryCategoryId: null } },
    ],
    edges: [
      { id: 'e1', from: ids.time, sourcePort: 'then', to: ids.scraper },
      { id: 'e2', from: ids.scraper, sourcePort: 'documents', to: ids.newsAgent },
      { id: 'e3', from: ids.newsAgent, sourcePort: 'article', to: imageId },
      { id: 'e4', from: imageId, sourcePort: 'article', to: ids.newsPost },
    ],
  }
}
