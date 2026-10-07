/**
 * The one width every member page's content column is held to: 1,140px on a
 * wide screen, centred, and the full width the frame allows on anything
 * narrower. Tyler's rule, 7 Oct 2026: "The width of the main content area is
 * too narrow. Expand it 30% wider", then one width for every member page.
 *
 * A page writes this class and adds its own gap and padding. It never sets a
 * `max-w-*` of its own, or the pages drift apart again. The invite cards and
 * the admin pages are deliberately not on it.
 */
export const contentColumn = "mx-auto w-full max-w-[1140px]"
