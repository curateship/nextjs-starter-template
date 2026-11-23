import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The media library lives in the Admin dashboard now, as its Media library
 * section (Tyler, 8 Nov 2026: "we add media library to it too";
 * `workspace/tasks/admin-changes.md`). An old link or bookmark lands there:
 * `?owner=` keeps whose files show, `?media=` becomes the file open on the
 * right, and `?orphan=` the orphan open.
 */
export const Route = createFileRoute("/_authenticated/admin/media")({
  validateSearch: (search: Record<string, unknown>) => ({
    owner: typeof search.owner === "string" && search.owner.length <= 36 ? search.owner : undefined,
    media: typeof search.media === "string" && search.media.length <= 36 ? search.media : undefined,
    orphan: typeof search.orphan === "string" && search.orphan.length <= 512 ? search.orphan : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/dashboard",
      search: { tab: "media", owner: search.owner, open: search.media, orphan: search.orphan },
      replace: true,
    })
  },
})
