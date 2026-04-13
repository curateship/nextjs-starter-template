export function extractDirectoryIsPrivate(contentBlocks: Record<string, any> | null | undefined): boolean {
  return contentBlocks?._settings?.is_private === true
}

export function normalizeDirectorySearchQuery(query?: string | null): string {
  return query?.trim().toLowerCase() || ''
}
