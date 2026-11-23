import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  compareCampaignRecords,
  isCampaignEligible,
  selectCampaignsForPath,
  splitCampaignEventBatches,
  validateCampaignInput,
  type CampaignRecord,
  type PublicCampaign,
} from './campaigns'

const baseCampaign: PublicCampaign = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  name: 'Summer sale',
  type: 'popup',
  content: {
    heading: 'Save 20%',
    text: 'This week only.',
    imageUrl: null,
    goal: 'link',
    ctaLabel: 'Shop now',
    ctaUrl: '/products',
    submitLabel: 'Subscribe',
    successMessage: 'Thanks for subscribing.',
  },
  targeting: { mode: 'all', paths: [] },
  trigger: { type: 'delay', value: 5 },
  frequency: 'once_per_visitor',
  startsAt: null,
  endsAt: null,
  createdAt: '2026-07-14T12:00:00.000Z',
}

function campaignRecord(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    ...baseCampaign,
    status: 'active',
    views: 0,
    dismissals: 0,
    submissions: 0,
    updatedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  }
}

describe('campaign eligibility', () => {
  it('honors start and end schedule bounds', () => {
    const campaign = {
      ...baseCampaign,
      startsAt: '2026-07-14T12:00:00.000Z',
      endsAt: '2026-07-14T14:00:00.000Z',
    }

    assert.equal(isCampaignEligible(campaign, '/', new Date('2026-07-14T11:59:59.000Z')), false)
    assert.equal(isCampaignEligible(campaign, '/', new Date('2026-07-14T13:00:00.000Z')), true)
    assert.equal(isCampaignEligible(campaign, '/', new Date('2026-07-14T14:00:01.000Z')), false)
  })

  it('matches include and exclude path lists after normalizing paths', () => {
    const included = { ...baseCampaign, targeting: { mode: 'include' as const, paths: ['/pricing/', '/products'] } }
    const excluded = { ...baseCampaign, targeting: { mode: 'exclude' as const, paths: ['/checkout'] } }

    assert.equal(isCampaignEligible(included, '/pricing?plan=pro'), true)
    assert.equal(isCampaignEligible(included, '/about'), false)
    assert.equal(isCampaignEligible(excluded, '/checkout/'), false)
    assert.equal(isCampaignEligible(excluded, '/about'), true)
  })

  it('returns every eligible bar but only the newest popup', () => {
    const olderPopup = { ...baseCampaign, id: '33333333-3333-4333-8333-333333333333', createdAt: '2026-07-14T10:00:00.000Z' }
    const bar = {
      ...baseCampaign,
      id: '44444444-4444-4444-8444-444444444444',
      type: 'bar' as const,
      content: { text: 'Free shipping', ctaLabel: null, ctaUrl: null },
      trigger: { type: 'immediate' as const, value: null },
    }

    const selected = selectCampaignsForPath([olderPopup, bar, baseCampaign], '/', new Date('2026-07-14T13:00:00.000Z'))

    assert.deepEqual(selected.bars.map((campaign) => campaign.id), [bar.id])
    assert.equal(selected.popup?.id, baseCampaign.id)
  })
})

describe('campaign input validation', () => {
  it('rejects unsafe CTA links and invalid schedule order', () => {
    const unsafe = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'Unsafe',
      type: 'bar',
      content: { text: 'Click', ctaLabel: 'Open', ctaUrl: 'javascript:alert(1)' },
      targeting: { mode: 'all', paths: [] },
      trigger: { type: 'immediate', value: null },
      frequency: 'every_visit',
      startsAt: null,
      endsAt: null,
      status: 'draft',
    })
    assert.equal(unsafe.ok, false)

    const schedule = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'Schedule',
      type: 'popup',
      content: baseCampaign.content,
      targeting: { mode: 'all', paths: [] },
      trigger: { type: 'delay', value: 5 },
      frequency: 'every_visit',
      startsAt: '2026-07-15T12:00:00.000Z',
      endsAt: '2026-07-14T12:00:00.000Z',
      status: 'active',
    })
    assert.equal(schedule.ok, false)
  })

  it('normalizes valid popup input and target paths', () => {
    const result = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: '  Sale  ',
      type: 'popup',
      content: baseCampaign.content,
      targeting: { mode: 'include', paths: ['pricing/', '/pricing', ' /products/?x=1 '] },
      trigger: { type: 'scroll', value: 50 },
      frequency: 'once_per_session',
      startsAt: null,
      endsAt: null,
      status: 'active',
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.data.name, 'Sale')
      assert.deepEqual(result.data.targeting.paths, ['/pricing', '/products'])
      assert.deepEqual(result.data.trigger, { type: 'scroll', value: 50 })
    }
  })

  it('rejects non-canonical values instead of silently coercing them', () => {
    const invalidTrigger = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'Invalid trigger',
      type: 'popup',
      content: baseCampaign.content,
      targeting: { mode: 'all', paths: [] },
      trigger: { type: 'scroll', value: 130 },
      frequency: 'every_visit',
      startsAt: null,
      endsAt: null,
      status: 'active',
    })
    assert.equal(invalidTrigger.ok, false)

    const hiddenPaths = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'Hidden paths',
      type: 'popup',
      content: baseCampaign.content,
      targeting: { mode: 'all', paths: ['/pricing'] },
      trigger: { type: 'delay', value: 5 },
      frequency: 'every_visit',
      startsAt: null,
      endsAt: null,
      status: 'active',
    })
    assert.equal(hiddenPaths.ok, false)

    const tooManyPaths = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'Too many paths',
      type: 'popup',
      content: baseCampaign.content,
      targeting: { mode: 'include', paths: Array.from({ length: 101 }, (_, index) => `/page-${index}`) },
      trigger: { type: 'delay', value: 5 },
      frequency: 'every_visit',
      startsAt: null,
      endsAt: null,
      status: 'active',
    })
    assert.equal(tooManyPaths.ok, false)

    const invalidGoal = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'Invalid goal',
      type: 'popup',
      content: { ...baseCampaign.content, goal: 'sms' } as unknown as typeof baseCampaign.content,
      targeting: { mode: 'all', paths: [] },
      trigger: { type: 'delay', value: 5 },
      frequency: 'every_visit',
      startsAt: null,
      endsAt: null,
      status: 'active',
    })
    assert.equal(invalidGoal.ok, false)
  })

  it('rejects overlong fields and invalid bar triggers', () => {
    const overlongName = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'x'.repeat(256),
      type: 'bar',
      content: { text: 'Announcement', ctaLabel: null, ctaUrl: null },
      targeting: { mode: 'all', paths: [] },
      trigger: { type: 'immediate', value: null },
      frequency: 'every_visit',
      startsAt: null,
      endsAt: null,
      status: 'draft',
    })
    assert.equal(overlongName.ok, false)

    const invalidBarTrigger = validateCampaignInput({
      siteId: baseCampaign.siteId,
      name: 'Announcement',
      type: 'bar',
      content: { text: 'Announcement', ctaLabel: null, ctaUrl: null },
      targeting: { mode: 'all', paths: [] },
      trigger: { type: 'delay', value: 5 },
      frequency: 'every_visit',
      startsAt: null,
      endsAt: null,
      status: 'draft',
    })
    assert.equal(invalidBarTrigger.ok, false)
  })
})

describe('campaign dashboard sorting', () => {
  it('sorts page counts numerically within the targeting mode', () => {
    const twoPages = campaignRecord({
      name: 'Two pages',
      targeting: { mode: 'include', paths: ['/one', '/two'] },
    })
    const tenPages = campaignRecord({
      name: 'Ten pages',
      targeting: { mode: 'include', paths: Array.from({ length: 10 }, (_, index) => `/page-${index}`) },
    })

    const sorted = [tenPages, twoPages].sort((left, right) => compareCampaignRecords(left, right, 'pages', 'asc'))

    assert.deepEqual(sorted.map((campaign) => campaign.name), ['Two pages', 'Ten pages'])
  })
})

describe('campaign event batching', () => {
  it('splits every queued event into bounded batches without dropping any', () => {
    const events = Array.from({ length: 45 }, (_, index) => index)
    const batches = splitCampaignEventBatches(events, 20)

    assert.deepEqual(batches.map((batch) => batch.length), [20, 20, 5])
    assert.deepEqual(batches.flat(), events)
  })
})
