import { createFileRoute } from "@tanstack/react-router"

import { GuestNotice } from "@/components/social/guest/guest-notice"

const REASONS = ["used", "expired", "bad", "gone", "off"] as const
type Reason = (typeof REASONS)[number]

/** What each refusal of a handoff note says. Tyler's own words for a used link. */
const WORDS: Record<Reason, { title: string; text: string }> = {
  used: {
    title: "This link has already been used",
    text: "This link has already been used. Open the task in Project again.",
  },
  expired: {
    title: "This link has expired",
    text: "This link has expired. Open the task in Project again.",
  },
  bad: {
    title: "This link does not work",
    text: "This link was changed or did not come from Project. Open the task in Project again.",
  },
  gone: {
    title: "This project is not in Promo any more",
    text: "The Promo project this task points at was deleted. Ask whoever made the task to point it at another one.",
  },
  off: {
    title: "Promo is not connected to Project",
    text: "Promo is not set up to take people from Project yet. Ask the site admin to add the key Promo shares with Project.",
  },
}

/**
 * Where the handoff address sends a refused note (`/handoff/project`), with
 * why in `?why=`. It has no sign-in and links nowhere, because whoever lands
 * here has no Promo account.
 */
export const Route = createFileRoute("/guest/refused")({
  validateSearch: (search: Record<string, unknown>): { why: Reason } => ({
    why: REASONS.includes(search.why as Reason) ? (search.why as Reason) : "bad",
  }),
  head: () => ({ meta: [{ title: "Promo" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: GuestRefused,
})

function GuestRefused() {
  const { why } = Route.useSearch()
  return <GuestNotice title={WORDS[why].title} text={WORDS[why].text} />
}
