/**
 * Shared input-validation helpers used across server actions and API routes.
 * Single source of truth for the UUID format check and list pagination clamping
 * (previously copy-pasted into ~70 call sites).
 */

/** Slugs no content item may use (shared by API routes and server actions) */
export const RESERVED_SLUGS = ['api', 'admin', 'www', 'mail', 'ftp', 'global']

/** Allowed slug characters: letters, numbers, hyphens, underscores */
export const SLUG_FORMAT_REGEX = /^[a-zA-Z0-9_-]+$/

/** Matches a standard 36-char hyphenated UUID (any version), case-insensitive */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when the value is a well-formed UUID string */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

/**
 * Clamp list pagination options: page >= 1, 1 <= pageSize <= max (default 100).
 * Returns the zero-based row offset alongside the normalized values.
 */
export function normalizePagination(
  options?: { page?: number; pageSize?: number } | null,
  defaults: { pageSize?: number; maxPageSize?: number } = {}
): { page: number; pageSize: number; offset: number } {
  const maxPageSize = defaults.maxPageSize ?? 100
  const page = Math.max(1, Math.floor(options?.page ?? 1))
  const pageSize = Math.min(maxPageSize, Math.max(1, Math.floor(options?.pageSize ?? defaults.pageSize ?? 50)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}
