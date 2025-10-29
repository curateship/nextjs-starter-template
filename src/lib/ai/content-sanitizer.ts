/**
 * Content Sanitizer
 * Sanitizes AI-generated content to prevent XSS and validate data
 */

import type { GeneratedBlock } from '@/lib/ai/types'

/**
 * Sanitize a string by removing dangerous content
 */
function sanitizeString(value: string): string {
  if (typeof value !== 'string') return ''

  // Remove script tags
  let sanitized = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '')

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')

  return sanitized.trim()
}

/**
 * Validate and sanitize a URL
 */
function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return ''

  const trimmed = url.trim()

  // Allow http, https, and relative URLs only
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return sanitizeString(trimmed)
  }

  // Invalid URL
  return ''
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item))
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize URLs specially
      if (key.toLowerCase().includes('url') || key.toLowerCase().includes('href') || key === 'src') {
        sanitized[key] = typeof value === 'string' ? sanitizeUrl(value) : value
      } else {
        sanitized[key] = sanitizeObject(value)
      }
    }
    return sanitized
  }

  return obj
}

/**
 * Sanitize a generated block's content
 */
export function sanitizeBlock(block: GeneratedBlock): GeneratedBlock {
  return {
    ...block,
    content: sanitizeObject(block.content)
  }
}

/**
 * Sanitize an array of generated blocks
 */
export function sanitizeBlocks(blocks: GeneratedBlock[]): GeneratedBlock[] {
  return blocks.map(block => sanitizeBlock(block))
}
