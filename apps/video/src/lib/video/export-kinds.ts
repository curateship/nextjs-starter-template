/**
 * The two kinds of export. Both are rows of `video_render_jobs`, and each has
 * its own dashboard: video exports on /admin/video-exports, kept carousel ZIPs
 * on /admin/video-carousel-exports. Every list, delete and clear-out is asked
 * for one kind, so neither page ever shows or removes the other's rows.
 */
export const EXPORT_KINDS = ["video", "carousel"] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]
