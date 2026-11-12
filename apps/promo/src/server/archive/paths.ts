/** Where an archive item's files live in the bucket: one folder per item. */
export function archivePath(userId: string, itemId: string, name: string): string {
  return `promo/archive/${userId}/${itemId}/${name}`
}

/** The Archive dashboard opened on one item. */
export function archiveItemHref(projectId: string, itemId: string): string {
  return `/admin/projects?section=archive&project=${encodeURIComponent(projectId)}&open=${encodeURIComponent(itemId)}`
}
