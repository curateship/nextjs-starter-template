import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The Courses page's one declaration. Every course's intro and chapter pages
 * under /courses follow this page's on/off switch rather than having one of
 * their own, the way CMS posts follow /posts.
 *
 * `source: "app"` is left out for the reason CMS's `directory.page.ts` gives:
 * the shell's `page-registry.test.ts` insists every page says "shell", and an
 * app never edits a shell file. The label is a caption and changes nothing.
 */
export default definePage({
  path: "/courses",
  name: "Courses",
  summary: "Every published course: written guides, one chapter at a time.",
  layout: "marketing",
})
