/**
 * Shared sanitization utilities for block content.
 * Prevents XSS by stripping script tags, javascript: URIs, and event handlers.
 */

/** Sanitize a string value to prevent XSS */
function sanitizeString(value: any): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:text\/html/gi, '')
}

/** Sanitize free-text admin input: strip HTML/script-protocol vectors and cap length */
export const sanitizeAdminInput = (input: string): string => {
  // Remove potential XSS vectors and limit length for admin inputs
  return input
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .substring(0, 1000) // Higher limit for admin but still prevent DoS
}

/** Recursively sanitize a content object (strings, arrays, nested objects) */
export function sanitizeContent(content: any): any {
  if (typeof content === 'string') {
    return sanitizeString(content)
  }
  if (Array.isArray(content)) {
    return content.map(sanitizeContent)
  }
  if (content && typeof content === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(content)) {
      sanitized[key] = sanitizeContent(value)
    }
    return sanitized
  }
  return content
}
