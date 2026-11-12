/**
 * The Admin dashboard's address with a page open in the builder, in the Pages
 * section as an open automation is in Automations (Tyler, 9 Nov 2026:
 * "Clicking on editing a page should not forward me to an isolated page
 * editor"). The page stays the one open in the list behind it.
 */
export function pageEditSearch(path: string) {
  return { tab: "pages" as const, open: path, edit: path }
}
