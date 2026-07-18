import { boundedString, requiredString } from '../parse-utils'
import { defineNode } from '../node-descriptor'

export const postNode = defineNode({
  kind: 'post',
  meta: { name: 'Post', description: 'Create a Hub post.', group: 'Actions' },
  inputs: 'single',
  terminal: true,
  createConfig: () => ({ templateId: '', publish: false, categoryIds: [], primaryCategoryId: null }),
  ports: () => [],
  parseConfig: (config) => {
    if (!Array.isArray(config.categoryIds) || config.categoryIds.length > 50) throw new Error('Post categories are invalid')
    return {
      templateId: boundedString(config.templateId, 'Post template', 64),
      publish: config.publish === true,
      categoryIds: config.categoryIds.map((id) => requiredString(id, 'Post category', 64)),
      primaryCategoryId: config.primaryCategoryId === null || config.primaryCategoryId === undefined
        ? null
        : requiredString(config.primaryCategoryId, 'Post primary category', 64),
    }
  },
  validate: (node, push) => {
    if (!node.config.templateId) push('post-template', 'Choose a Post template.')
    if (node.config.primaryCategoryId && !node.config.categoryIds.includes(node.config.primaryCategoryId)) {
      push('post-category', 'The primary category must be selected.')
    }
  },
  allowedTargets: () => [],
  resourceRefs: (node) => ({
    postTemplateIds: node.config.templateId ? [node.config.templateId] : [],
    categoryIds: node.config.categoryIds,
  }),
  validateResources: (node, resolved, push) => {
    if (node.config.templateId && !resolved.postTemplates.has(node.config.templateId)) {
      push('post-template-missing', 'The selected Post template is unavailable.')
    }
    if (node.config.categoryIds.some((id) => !resolved.categories.has(id))) {
      push('post-category-missing', 'One or more selected Post categories are unavailable.')
    }
  },
})
