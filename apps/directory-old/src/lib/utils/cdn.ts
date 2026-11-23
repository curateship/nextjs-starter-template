const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

/**
 * Convert a full R2 public URL to a cached /cdn/ path.
 * Passes through non-R2 URLs unchanged.
 */
export function toCdnUrl(url: string): string {
  if (!R2_PUBLIC_URL || !url.startsWith(R2_PUBLIC_URL)) return url
  return url.replace(R2_PUBLIC_URL, '/cdn')
}
