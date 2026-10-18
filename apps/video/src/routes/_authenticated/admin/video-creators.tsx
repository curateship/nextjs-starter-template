import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Creators page folded into Viral: each creator folder became a Viral
 * project. An old link or bookmark lands on the projects list.
 */
export const Route = createFileRoute("/_authenticated/admin/video-creators")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/video-viral", replace: true })
  },
})
