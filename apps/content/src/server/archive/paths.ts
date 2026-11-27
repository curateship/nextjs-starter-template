/** Where an archive item's files live in the bucket: one folder per item. */
export function archivePath(userId: string, itemId: string, name: string): string {
  return `promo/archive/${userId}/${itemId}/${name}`
}

/** The project's Content opened on one item (`workspace/docs/content-app.md`, "A project's own page"). */
export function archiveItemHref(projectId: string, itemId: string): string {
  return `/admin/projects/${encodeURIComponent(projectId)}?archive=1&open=${encodeURIComponent(itemId)}`
}
