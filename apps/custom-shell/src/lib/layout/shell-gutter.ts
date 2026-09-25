/**
 * The one gutter value every page-level container reads.
 *
 * `--shell-gutter` is set by `DashboardContent` from the workspace's Styling
 * settings, so anything inside a page gets the user's spacing. The fallback is
 * only reached outside that area — inside a modal, mainly — where 24px matches
 * the modal's own default padding. Import this instead of restating the
 * `var(...)` string, or the fallbacks drift apart page by page again.
 */
export const pageGutter = "var(--shell-gutter, 1.5rem)"
