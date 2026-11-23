import { createFileRoute } from "@tanstack/react-router"

import { ProjectGuestNotice } from "@/components/video-editor/project-guest-notice"

/**
 * Why a link from Project didn't open the editor (`workspace/docs/project-guests.md`).
 * `/handoff/project` sends a refused note here with `?why=`, so a copied
 * address says it was already used. Not a registered public page: it has no
 * place in the sitemap or the menu.
 */
const REASONS: Record<string, { title: string; text: string }> = {
  used: {
    title: "This link has already been used",
    text: "Open the task in Project again.",
  },
  expired: {
    title: "This link has expired",
    text: "A link from Project works for one minute. Open the task in Project again.",
  },
  bad: {
    title: "This link doesn't work",
    text: "It wasn't made by Project, or it was changed on the way. Open the task in Project again.",
  },
  gone: {
    title: "This video project no longer exists",
    text: "It was deleted in Video. Ask whoever gave you the task.",
  },
  off: {
    title: "Opening videos from Project isn't set up yet",
    text: "This server doesn't have its key for Project. Ask whoever gave you the task.",
  },
}

const ENDED = {
  title: "Your time in this video has ended",
  text: "Open the task in Project again.",
}

export const Route = createFileRoute("/guest/ended")({
  validateSearch: (search: Record<string, unknown>) => ({
    why: typeof search.why === "string" && Object.hasOwn(REASONS, search.why) ? search.why : undefined,
  }),
  head: () => ({ meta: [{ title: "Video" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: GuestEndedRoute,
})

function GuestEndedRoute() {
  const { why } = Route.useSearch()
  return <ProjectGuestNotice {...(why ? REASONS[why] : ENDED)} />
}
