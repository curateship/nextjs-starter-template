import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The one declaration public trader profiles need. A profile's own page,
 * `/t/<handle>`, is an address worked out from the database rather than a
 * page an admin manages, so it has no declaration of its own and follows
 * this one's on/off switch instead.
 *
 * `source: "app"` is left out for the reason written on the CMS app's
 * `directory.page.ts`: the shell's own registry test still insists every
 * page says "shell", and that test is a shell file.
 */
export default definePage({
  path: "/traders",
  name: "Traders",
  summary:
    "The leaderboard of public trader profiles, ranked by what their real wallets made.",
  layout: "marketing",
})
