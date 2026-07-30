import { boundedString, requiredString } from '../parse-utils'
import { defineNode } from '../node-descriptor'
import type { NewsletterSubjectMode } from '../types'

const SUBJECT_MODES: NewsletterSubjectMode[] = ['article', 'fixed']

// The `newsletters.subject` column's width — the one bound for a subject line, shared
// by the config parser, the runtime resolver, and the editor's input.
export const NEWSLETTER_SUBJECT_MAX = 255

export const newsletterNode = defineNode({
  kind: 'newsletter',
  meta: { name: 'Newsletter', description: 'Draft a newsletter to review and send.', group: 'Actions' },
  inputs: 'single',
  terminal: true,
  createConfig: () => ({ templateId: null, subjectMode: 'article', subjectText: '' }),
  ports: () => [],
  parseConfig: (config) => {
    const subjectMode = SUBJECT_MODES.includes(config.subjectMode as NewsletterSubjectMode)
      ? (config.subjectMode as NewsletterSubjectMode)
      : 'article'
    return {
      templateId: config.templateId === null || config.templateId === undefined || config.templateId === ''
        ? null
        : requiredString(config.templateId, 'Newsletter template', 64),
      subjectMode,
      subjectText: boundedString(config.subjectText ?? '', 'Newsletter subject line', NEWSLETTER_SUBJECT_MAX),
    }
  },
  validate: (node, push) => {
    if (node.config.subjectMode === 'fixed' && !node.config.subjectText.trim()) {
      push('newsletter-subject', 'Write the fixed subject line, or let the AI write it.')
    }
  },
  allowedTargets: () => [],
  resourceRefs: (node) => ({
    newsletterTemplateIds: node.config.templateId ? [node.config.templateId] : [],
  }),
  validateResources: (node, resolved, push) => {
    if (node.config.templateId && !resolved.newsletterTemplates.has(node.config.templateId)) {
      push('newsletter-template-missing', 'The selected newsletter template is unavailable.')
    }
  },
})
