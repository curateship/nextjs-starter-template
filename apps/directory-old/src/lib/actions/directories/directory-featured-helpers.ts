// Pure helpers for the directory featured-upgrade flow. Kept free of
// 'server-only' so they stay unit-testable (see directory-featured-helpers.test.ts).

/**
 * Restrict the post-checkout redirect to a same-site path. Anything that could
 * escape the site (absolute URLs, protocol-relative '//', backslash tricks)
 * falls back to the owner listings page. Query/hash are stripped so the
 * checkout result params are the only ones on the redirect.
 */
export function sanitizeReturnPath(value: unknown) {
  const path = typeof value === 'string' ? value.trim() : ''
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/account/my-listings'
  }
  return path.split(/[?#]/)[0] || '/account/my-listings'
}

export function isDirectoryFeaturedNow(featuredUntil: string | null | undefined) {
  return Boolean(featuredUntil && new Date(featuredUntil).getTime() > Date.now())
}

/** Format a Stripe minor-unit amount like 4900/'usd' as "$49.00"; null when unknown. */
export function formatCentsAmount(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return null
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency || ''}`.trim()
  }
}
