import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The one declaration the directory needs. A listing's own page and a category
 * page are addresses worked out from the database rather than pages an admin
 * manages, so they have no declaration of their own — they follow this one's
 * on/off switch instead.
 *
 * **`source: "app"` is deliberately not written here, and it should be.** The
 * shell offers it so the Pages screen can say which pages an app added — but
 * `src/lib/pages/page-registry.test.ts` insists every page's source is
 * `"shell"`, which is true inside custom-shell and false in any app that uses
 * the option. That test is a shell file and an app never edits one, so this
 * page goes without the label until the shell's own check is widened to accept
 * `"app"`. Nothing else is affected: the source is a caption and changes no
 * permission, no visibility and no way of editing.
 */
export default definePage({
  path: "/directory",
  name: "Directory",
  summary: "The public list of this site's listings, with search and categories.",
  layout: "marketing",
})
