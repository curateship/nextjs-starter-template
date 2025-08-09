/**
 * Validates if a URL is safe to use in img src or links
 * Prevents XSS attacks through javascript: and data: URIs
 */
export function isSafeUrl(url: string | undefined | null): boolean {
  if (!url) return false
  
  const lowerUrl = url.toLowerCase().trim()
  
  // Block dangerous protocols
  const dangerousProtocols = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
    'about:',
    'blob:'
  ]
  
  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return false
    }
  }
  
  // Allow relative URLs and common protocols
  const safeProtocols = [
    'http://',
    'https://',
    '/',
    './',
    '../'
  ]
  
  // Check if it starts with a safe protocol or is a relative URL
  const isSafe = safeProtocols.some(protocol => 
    lowerUrl.startsWith(protocol)
  ) || (!lowerUrl.includes(':') && !lowerUrl.startsWith('//'))
  
  return isSafe
}

/**
 * Sanitizes a URL for safe use
 * Returns a safe fallback if the URL is dangerous
 */
export function sanitizeUrl(url: string | undefined | null, fallback: string = '#'): string {
  if (!url) return fallback
  return isSafeUrl(url) ? url : fallback
}