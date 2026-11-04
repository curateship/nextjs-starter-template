import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/",
  name: "Home",
  summary: "The front page a visitor lands on.",
  canSwitchOff: false,
  layout: "marketing",
  // The one page built from blocks today. Everything else on this shell draws
  // its own markup.
  blocks: true,
})
