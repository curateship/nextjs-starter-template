export function normalizeDirectorySearchQuery(query?: string | null): string {
  return query?.trim().toLowerCase() || ''
}
