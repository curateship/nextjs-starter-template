import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/",
  name: "Home",
  summary: "The front page a visitor lands on.",
  canSwitchOff: false,
  layout: "marketing",
})
